import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant, toCSV } from '@/lib/reports-helpers';
import { logAudit } from '@/lib/audit';

// Limite m\u00e1ximo de linhas para exportar de uma vez (proteg\u00e7\u00e3o de mem\u00f3ria)
const EXPORT_HARD_LIMIT = 10000;

export const GET = withPermission('REPORTS_EXPORT', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const built = buildReportContext(session, searchParams);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const ctx = built.ctx;
  const err = await validateFiltersBelongToTenant(ctx);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const leads = await prisma.lead.findMany({
    where: ctx.leadsWhere,
    include: {
      stage: { select: { name: true } },
      pipeline: { select: { name: true } },
      form: { select: { name: true } },
      assignedUser: { select: { name: true, email: true } },
      _count: { select: { tasks: true } },
      tasks: { select: { status: true, dueDate: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: EXPORT_HARD_LIMIT,
  });

  const now = new Date();
  const statusMap: Record<string, string> = { open: 'Aberto', won: 'Ganho', lost: 'Perdido' };
  const tempMap: Record<string, string> = { cold: 'Frio', warm: 'Morno', hot: 'Quente' };

  const rows = leads.map((l) => {
    const pending = l.tasks.filter((t) => t.status === 'pending').length;
    const overdue = l.tasks.filter((t) => t.status === 'pending' && t.dueDate && t.dueDate < now).length;
    return {
      id: l.id,
      nome: l.name,
      email: l.email || '',
      telefone: l.phone || '',
      origem: l.source,
      formulario: l.form?.name || '',
      pipeline: l.pipeline?.name || '',
      etapa: l.stage?.name || '',
      status: statusMap[l.status] || l.status,
      temperatura: tempMap[l.temperature] || l.temperature,
      responsavel: l.assignedUser?.name || '',
      email_responsavel: l.assignedUser?.email || '',
      data_criacao: l.createdAt.toISOString(),
      ultima_atualizacao: l.updatedAt.toISOString(),
      motivo_perda: l.lostReason || '',
      tarefas_total: l._count.tasks,
      tarefas_pendentes: pending,
      tarefas_vencidas: overdue,
    };
  });

  const headers = [
    { key: 'id', label: 'ID' },
    { key: 'nome', label: 'Nome' },
    { key: 'email', label: 'E-mail' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'origem', label: 'Origem' },
    { key: 'formulario', label: 'Formul\u00e1rio' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'etapa', label: 'Etapa' },
    { key: 'status', label: 'Status' },
    { key: 'temperatura', label: 'Temperatura' },
    { key: 'responsavel', label: 'Respons\u00e1vel' },
    { key: 'email_responsavel', label: 'E-mail do Respons\u00e1vel' },
    { key: 'data_criacao', label: 'Data de Cria\u00e7\u00e3o' },
    { key: 'ultima_atualizacao', label: '\u00daltima Atualiza\u00e7\u00e3o' },
    { key: 'motivo_perda', label: 'Motivo de Perda' },
    { key: 'tarefas_total', label: 'Tarefas (total)' },
    { key: 'tarefas_pendentes', label: 'Tarefas Pendentes' },
    { key: 'tarefas_vencidas', label: 'Tarefas Vencidas' },
  ];

  const csv = toCSV(rows, headers);

  await logAudit({
    tenantId: ctx.tenantId, userId: ctx.userId,
    entityType: 'report', entityId: 'leads-export', action: 'reports.exported',
    metadata: {
      rowCount: rows.length,
      range: ctx.filters.range,
      from: ctx.from.toISOString(),
      to: ctx.to.toISOString(),
      filters: {
        pipelineId: ctx.filters.pipelineId || null,
        formId: ctx.filters.formId || null,
        source: ctx.filters.source || null,
        assignedTo: ctx.filters.assignedTo || null,
      },
    },
  });

  const filename = `flipform-leads-${ctx.from.toISOString().slice(0, 10)}_${ctx.to.toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
