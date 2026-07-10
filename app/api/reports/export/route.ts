import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant, toCSV } from '@/lib/reports-helpers';
import { logAudit } from '@/lib/audit';
import { extractLeadLocation } from '@/lib/dashboard-metrics';
import { getLeadRevenueSource, summarizePurchases } from '@/lib/lead-purchases';

export const runtime = 'nodejs';

const EXPORT_HARD_LIMIT = 10000;
const PURCHASE_EXPORT_LIMIT = 50000;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BLUE = 'FF2563EB';
const LIGHT_BORDER = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } };
const currencyFmt = 'R$ #,##0.00';
const dateTimeFmt = 'dd/mm/yyyy hh:mm';
const percentFmt = '0.00%';

const statusMap: Record<string, string> = { open: 'Em aberto', won: 'Ganho', lost: 'Perdido' };
const tempMap: Record<string, string> = { cold: 'Frio', warm: 'Morno', hot: 'Quente' };
const paymentMap: Record<string, string> = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', cash: 'Dinheiro', boleto: 'Boleto', bank_transfer: 'Transferência bancária', other: 'Outro' };

function money(cents: number) { return Math.round(cents || 0) / 100; }
function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function emptyTo(value: string | null | undefined, fallback: string) { return value && value.trim() ? value : fallback; }
function formatDuration(from: Date, to?: Date | null) {
  if (!to) return '';
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days >= 10) return `${days}d`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}
function customerType(count: number) { return count === 0 ? 'Sem compra' : count === 1 ? 'Cliente novo' : 'Cliente recorrente'; }
function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}
function styleSheet(ws: ExcelJS.Worksheet) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  styleHeader(ws.getRow(1));
  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER };
      cell.alignment = { vertical: 'middle', wrapText: rowNumber === 1 };
    });
    if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
}

export const GET = withPermission('REPORTS_EXPORT', async (req, session) => {
  try {
    const { searchParams } = new URL(req.url);
    const built = buildReportContext(session, searchParams);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
    const ctx = built.ctx;
    const err = await validateFiltersBelongToTenant(ctx);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const format = (searchParams.get('format') || 'xlsx').toLowerCase();
    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } });
    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } });

    const leads = await prisma.lead.findMany({
      where: ctx.leadsWhere,
      include: {
        stage: { select: { id: true, name: true } }, pipeline: { select: { id: true, name: true } }, form: { select: { name: true } }, assignedUser: { select: { name: true, email: true } },
        tasks: { select: { status: true, dueDate: true, completedAt: true } },
        purchases: { orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }], select: { amountCents: true, purchaseDate: true, createdAt: true } },
        answers: { select: { questionLabel: true, answer: true, field: { select: { fieldType: true } } } },
        history: { orderBy: { createdAt: 'asc' }, select: { createdAt: true, fromStageId: true, toStageId: true, toStage: { select: { id: true, name: true, orderIndex: true, isArchived: true } } } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_HARD_LIMIT,
    });

    if (format === 'csv') {
      const rows = leads.map((l) => ({ id: l.id, nome: l.name, email: l.email || '', telefone: l.phone || '', origem: l.source, formulario: l.form?.name || 'Lead manual', pipeline: l.pipeline?.name || '', etapa: l.stage?.name || '', status: statusMap[l.status] || l.status }));
      const csv = toCSV(rows, Object.keys(rows[0] || { id: '' }).map((key) => ({ key, label: key })));
      return new NextResponse(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="flipform-relatorio-${dateKey(ctx.from)}_a_${dateKey(ctx.to)}.csv"`, 'Cache-Control': 'no-store' } });
    }

    const { createdAt: _leadCreatedAt, ...purchaseLeadWhere } = ctx.leadsWhere;
    const purchases = await prisma.leadPurchase.findMany({
      where: { tenantId: ctx.tenantId, purchaseDate: { gte: ctx.from, lte: ctx.to }, lead: purchaseLeadWhere },
      include: { lead: { include: { form: { select: { name: true } }, assignedUser: { select: { name: true, email: true } }, answers: { select: { questionLabel: true, answer: true, field: { select: { fieldType: true } } } } } } },
      orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }], take: PURCHASE_EXPORT_LIMIT,
    });

    const pipelineIds = Array.from(new Set(leads.map((l) => l.pipelineId)));
    const finalStages = await prisma.pipelineStage.findMany({ where: { pipelineId: { in: pipelineIds }, isArchived: false }, orderBy: [{ pipelineId: 'asc' }, { orderIndex: 'desc' }], select: { id: true, pipelineId: true, orderIndex: true } });
    const finalByPipeline = new Map<string, string>();
    finalStages.forEach((s) => { if (!finalByPipeline.has(s.pipelineId)) finalByPipeline.set(s.pipelineId, s.id); });
    const closingDate = (lead: typeof leads[number]) => {
      const finalId = finalByPipeline.get(lead.pipelineId);
      const moved = finalId ? lead.history.find((h) => h.toStageId === finalId)?.createdAt : null;
      if (moved) return moved;
      return lead.status === 'won' ? (lead.saleValueUpdatedAt || lead.updatedAt) : null;
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FlipForm'; workbook.created = new Date(); workbook.modified = new Date();
    const resumo = workbook.addWorksheet('Resumo');
    const leadsWs = workbook.addWorksheet('Leads');
    const comprasWs = workbook.addWorksheet('Compras');

    const won = leads.filter((l) => l.status === 'won').length, lost = leads.filter((l) => l.status === 'lost').length, open = leads.filter((l) => l.status === 'open').length;
    const revenue = leads.reduce((sum, l) => sum + getLeadRevenueSource(l).amountCents, 0);
    const purchaseCount = leads.reduce((sum, l) => sum + (l.purchases.length || ((l.saleValueCents || 0) > 0 ? 1 : 0)), 0);
    const buyers = leads.filter((l) => (l.purchases.length || ((l.saleValueCents || 0) > 0 ? 1 : 0)) > 0).length;
    const recurring = leads.filter((l) => l.purchases.length >= 2).length;
    const now = new Date();
    const taskPending = leads.flatMap((l) => l.tasks).filter((t) => t.status === 'pending').length;
    const taskOverdue = leads.flatMap((l) => l.tasks).filter((t) => t.status === 'pending' && t.dueDate && t.dueDate < now).length;
    const taskDone = leads.flatMap((l) => l.tasks).filter((t) => t.status === 'completed' && t.completedAt && t.completedAt >= ctx.from && t.completedAt <= ctx.to).length;
    const firstMoveHours = leads.flatMap((l) => { const first = l.history.find((h) => h.fromStageId)?.createdAt; return first ? [(first.getTime() - l.createdAt.getTime()) / 3600000] : []; });
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const cycle = leads.filter((l) => l.status === 'won' || l.status === 'lost').map((l) => (l.updatedAt.getTime() - l.createdAt.getTime()) / 3600000);

    resumo.mergeCells('A1:F1'); resumo.getCell('A1').value = 'Relatório Comercial FlipForm'; resumo.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF0F172A' } };
    resumo.addRows([[], ['Empresa', tenant?.name || 'Não informado', 'Período analisado', `${dateKey(ctx.from)} a ${dateKey(ctx.to)}`, 'Gerado em', now], ['Usuário', `${user?.name || session.userId} (${user?.email || ''})`, 'Pipeline selecionado', ctx.filters.pipelineId || 'Todos', 'Formulário selecionado', ctx.filters.formId || 'Todos'], ['Origem selecionada', ctx.filters.source || 'Todas', 'Vendedor selecionado', ctx.filters.assignedTo || 'Todos', '', ''], []]);
    resumo.getCell('F3').numFmt = dateTimeFmt;
    resumo.addRow(['Indicador', 'Valor', 'Indicador', 'Valor', 'Indicador', 'Valor']); styleHeader(resumo.getRow(7));
    const metrics = [['Total de leads', leads.length, 'Leads ganhos', won, 'Leads perdidos', lost], ['Leads em aberto', open, 'Taxa de conversão', leads.length ? won / leads.length : 0, 'Receita total', money(revenue)], ['Quantidade de compras', purchaseCount, 'Clientes compradores', buyers, 'Clientes recorrentes', recurring], ['Taxa de recompra', buyers ? recurring / buyers : 0, 'Ticket médio', purchaseCount ? money(revenue) / purchaseCount : 0, 'Tempo médio até primeira ação', `${avg(firstMoveHours).toFixed(1)}h`], ['Tempo médio no funil', `${avg(cycle).toFixed(1)}h`, 'Tarefas pendentes', taskPending, 'Tarefas vencidas', taskOverdue], ['Tarefas concluídas no período', taskDone, '', '', '', '']];
    resumo.addRows(metrics);
    ['B','D','F'].forEach((col) => { resumo.getColumn(col).width = 18; }); ['A','C','E'].forEach((col) => { resumo.getColumn(col).width = 30; });
    resumo.getCell('D9').numFmt = percentFmt; resumo.getCell('F9').numFmt = currencyFmt; resumo.getCell('D11').numFmt = percentFmt; resumo.getCell('D12').numFmt = currencyFmt;
    if (leads.length >= EXPORT_HARD_LIMIT) resumo.addRow(['Aviso', `A exportação foi limitada aos primeiros ${EXPORT_HARD_LIMIT} registros.`]);
    if (purchases.length >= PURCHASE_EXPORT_LIMIT) resumo.addRow(['Aviso', `A exportação de compras foi limitada aos primeiros ${PURCHASE_EXPORT_LIMIT} registros.`]);
    resumo.eachRow((row) => row.eachCell((cell) => { cell.border = { top: LIGHT_BORDER, left: LIGHT_BORDER, bottom: LIGHT_BORDER, right: LIGHT_BORDER }; }));

    const leadHeaders = ['ID do lead','Nome do cliente','E-mail','Telefone','Estado','Cidade','Origem','Formulário','Pipeline','Etapa atual','Status','Temperatura','Vendedor responsável','E-mail do vendedor','Data de entrada','Data da primeira ação','Data de fechamento','Tempo até fechamento','Valor total vendido','Quantidade de compras','Tipo de cliente','Data da última compra','Motivo de perda','Tarefas totais','Tarefas pendentes','Tarefas vencidas','Última atualização'];
    leadsWs.addRow(leadHeaders);
    leads.forEach((l) => {
      const location = extractLeadLocation(l as any); const summary = summarizePurchases(l.purchases); const count = summary.purchaseCount || ((l.saleValueCents || 0) > 0 ? 1 : 0); const close = closingDate(l);
      const lastPurchase = summary.lastPurchaseAt ? new Date(summary.lastPurchaseAt) : ((l.saleValueCents || 0) > 0 ? l.saleValueUpdatedAt : null); const pending = l.tasks.filter((t) => t.status === 'pending').length; const overdue = l.tasks.filter((t) => t.status === 'pending' && t.dueDate && t.dueDate < now).length;
      const row = leadsWs.addRow([l.id, emptyTo(l.name, 'Não informado'), l.email || '', l.phone || '', location.state || '', location.city || '', l.source || '', l.form?.name || 'Lead manual', l.pipeline?.name || '', l.stage?.name || '', statusMap[l.status] || l.status, tempMap[l.temperature] || l.temperature, l.assignedUser?.name || 'Sem responsável', l.assignedUser?.email || '', l.createdAt, l.history[0]?.createdAt || null, close, formatDuration(l.createdAt, close), money(getLeadRevenueSource(l).amountCents), count, customerType(count), lastPurchase, l.lostReason || '', l._count.tasks, pending, overdue, l.updatedAt]);
      [15,16,17,22,27].forEach((c) => { row.getCell(c).numFmt = dateTimeFmt; }); row.getCell(19).numFmt = currencyFmt;
      if (l.status === 'won') row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      if (l.status === 'lost') row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      if (l.status === 'open') row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      if (count >= 2) row.getCell(21).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    });
    [38,28,30,18,10,22,18,28,22,22,14,14,24,30,20,20,20,18,18,18,20,20,35,16,18,18,20].forEach((w, i) => { leadsWs.getColumn(i + 1).width = w; }); styleSheet(leadsWs);

    const purchaseHeaders = ['Data da compra','Nome do cliente','Telefone','E-mail','Estado','Cidade','Vendedor responsável','Formulário','Número do pedido','Forma de pagamento','Valor','Tipo da compra','Observação','Data de registro'];
    comprasWs.addRow(purchaseHeaders);
    const ordinalByLead = new Map<string, number>();
    purchases.forEach((p) => { const n = (ordinalByLead.get(p.leadId) || 0) + 1; ordinalByLead.set(p.leadId, n); const loc = extractLeadLocation(p.lead as any); const row = comprasWs.addRow([p.purchaseDate, emptyTo(p.lead.name, 'Não informado'), p.lead.phone || '', p.lead.email || '', loc.state || '', loc.city || '', p.lead.assignedUser?.name || 'Sem responsável', p.lead.form?.name || 'Lead manual', p.orderNumber || '', paymentMap[p.paymentMethod || ''] || p.paymentMethod || '', money(p.amountCents), n === 1 ? 'Primeira compra' : `Recompra ${n}`, p.notes || '', p.createdAt]); row.getCell(1).numFmt = dateTimeFmt; row.getCell(11).numFmt = currencyFmt; row.getCell(14).numFmt = dateTimeFmt; });
    if (purchases.length === 0) comprasWs.addRow(['Nenhuma compra registrada no período']);
    [20,28,18,30,10,22,24,28,18,22,18,18,35,20].forEach((w, i) => { comprasWs.getColumn(i + 1).width = w; }); styleSheet(comprasWs);

    const filename = `flipform-relatorio-${dateKey(ctx.from)}_a_${dateKey(ctx.to)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.from(buffer);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, entityType: 'report', entityId: 'leads-export', action: 'reports.exported', metadata: { format: 'xlsx', rowCount: leads.length, purchaseRowCount: purchases.length, range: ctx.filters.range, from: ctx.from.toISOString(), to: ctx.to.toISOString(), filters: { pipelineId: ctx.filters.pipelineId || null, formId: ctx.filters.formId || null, source: ctx.filters.source || null, assignedTo: ctx.filters.assignedTo || null }, filename, worksheets: ['Resumo', 'Leads', 'Compras'] } });
    return new NextResponse(output, { status: 200, headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('reports export failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Não foi possível gerar o relatório em Excel.' }, { status: 500 });
  }
});
