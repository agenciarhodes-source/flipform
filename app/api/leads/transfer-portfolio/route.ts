import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

const bodySchema = z.object({
  fromUserId: z.string().trim().min(1),
  toUserId: z.string().trim().min(1),
}).strict().refine((body) => body.fromUserId !== body.toUserId);

/** The attendants of this company, with how many open leads each one holds. */
export const GET = withPermission('LEADS_EDIT_ALL', async (_req: NextRequest, session) => {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId: session.tenantId, role: 'agent' },
    orderBy: { createdAt: 'asc' },
    select: { status: true, user: { select: { id: true, name: true } } },
  });
  const counts = await prisma.lead.groupBy({
    by: ['assignedTo'],
    where: { tenantId: session.tenantId, status: 'open', assignedTo: { in: members.map((member) => member.user.id) } },
    _count: { _all: true },
  });
  const openLeads = new Map(counts.map((row) => [row.assignedTo, row._count._all]));
  return NextResponse.json({
    attendants: members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      active: member.status === 'active',
      openLeads: openLeads.get(member.user.id) || 0,
    })),
  });
});

/**
 * Hands every open lead of one attendant, with its conversations and their whole history, to
 * another attendant. Used for vacations, leaves and overload. Won and lost leads keep their owner.
 */
export const POST = withPermission('LEADS_EDIT_ALL', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Escolha dois atendentes diferentes.' }, { status: 400 });
  const { fromUserId, toUserId } = parsed.data;

  const [from, to] = await Promise.all([
    prisma.tenantUser.findFirst({ where: { tenantId: session.tenantId, userId: fromUserId, role: 'agent' }, select: { user: { select: { name: true } } } }),
    prisma.tenantUser.findFirst({ where: { tenantId: session.tenantId, userId: toUserId, role: 'agent', status: 'active' }, select: { user: { select: { name: true } } } }),
  ]);
  if (!from) return NextResponse.json({ error: 'Atendente de origem não encontrado nesta empresa.' }, { status: 404 });
  if (!to) return NextResponse.json({ error: 'O atendente de destino precisa estar ativo nesta empresa.' }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const leads = await tx.lead.findMany({
      where: { tenantId: session.tenantId, assignedTo: fromUserId, status: 'open' },
      select: { id: true },
    });
    const leadIds = leads.map((lead) => lead.id);
    if (leadIds.length) {
      await tx.lead.updateMany({ where: { tenantId: session.tenantId, id: { in: leadIds } }, data: { assignedTo: toUserId } });
    }
    // The conversations of those leads, and any conversation assigned to the attendant directly.
    const conversations = await tx.conversation.updateMany({
      where: {
        tenantId: session.tenantId,
        provider: 'meta',
        OR: [
          ...(leadIds.length ? [{ leadId: { in: leadIds } }] : []),
          { assignedTo: fromUserId, status: { not: 'resolved' } },
        ],
      },
      data: { assignedTo: toUserId },
    });
    if (leadIds.length) {
      await tx.auditLog.createMany({
        data: leadIds.map((leadId) => ({
          tenantId: session.tenantId,
          userId: session.userId,
          entityType: 'lead',
          entityId: leadId,
          action: 'lead.updated',
          metadata: {
            changes: ['assignedTo'],
            assignedTo: toUserId,
            previousAssignedTo: fromUserId,
            message: 'Carteira transferida entre atendentes.',
          },
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'tenant_user',
        entityId: fromUserId,
        action: 'lead.portfolio_transferred',
        metadata: { fromUserId, toUserId, leads: leadIds.length, conversations: conversations.count },
      },
    });
    return { leads: leadIds.length, conversations: conversations.count };
  });

  return NextResponse.json({ ok: true, from: from.user.name, to: to.user.name, ...result });
});
