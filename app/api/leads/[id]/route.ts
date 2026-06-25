import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, can, canEditLead } from '@/lib/rbac-server';
import { withAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const GET = withPermission('LEADS_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: {
      stage: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      form: { select: { id: true, name: true } },
      answers: true,
      history: {
        include: { fromStage: true, toStage: true, changer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      notes: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      },
    },
  });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const saleValueAuditLogs = await prisma.auditLog.findMany({
    where: { tenantId: session.tenantId, entityType: 'lead', entityId: lead.id, action: 'lead.sale_value_updated' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, metadata: true, createdAt: true },
  });
  return NextResponse.json({ lead: { ...lead, saleValueAuditLogs } });
});

export const PUT = withAuth(async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) {
    return NextResponse.json({ error: 'Sem permissão para editar este lead.' }, { status: 403 });
  }
  const body = await req.json();
  const allowed: any = {};
  ['name', 'email', 'phone', 'temperature', 'assignedTo', 'lostReason'].forEach((k) => {
    if (body[k] !== undefined) allowed[k] = body[k];
  });
  await prisma.lead.update({ where: { id: lead.id }, data: allowed });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'lead', entityId: lead.id, action: 'lead.updated',
    metadata: { changes: Object.keys(allowed) },
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = withPermission('LEADS_DELETE', async (_req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.lead.delete({ where: { id: lead.id } });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'lead', entityId: lead.id, action: 'lead.deleted',
    metadata: { name: lead.name, email: lead.email },
  });
  return NextResponse.json({ ok: true });
});
