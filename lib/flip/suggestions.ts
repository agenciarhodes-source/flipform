import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { getInboxConversationWhere, withInboxScope } from '@/lib/inbox/access';
import { isWaitingForAnswer } from '@/lib/inbox/unanswered';
import { computeFlipAlerts } from './alerts';
import { FLIP_ALERT_RULES, waitingFor } from './alert-rules';
import { canSuggestAgain, lighterAttendant, nextFollowUpSlot, rebalanceCount, SUGGESTION_RULES, type SuggestionKind } from './suggestion-rules';

type Session = { tenantId: string; userId: string; role: string };
type Candidate = { kind: SuggestionKind; subjectKey: string; leadId: string | null; payload: Record<string, unknown>; reason: string };
const DAY = 86_400_000;

async function attendantLoads(tenantId: string) {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId, role: 'agent', status: 'active' },
    select: { userId: true, user: { select: { name: true } } },
  });
  const counts = await prisma.lead.groupBy({
    by: ['assignedTo'],
    where: { tenantId, status: 'open', assignedTo: { in: members.map((member) => member.userId) } },
    _count: { _all: true },
  });
  const byUser = new Map(counts.map((row) => [row.assignedTo, row._count._all]));
  return members.map((member) => ({ userId: member.userId, name: member.user.name, openLeads: byUser.get(member.userId) || 0 }));
}

async function buildCandidates(session: Session, now: Date): Promise<Candidate[]> {
  const seesTeam = can(session.role, 'LEADS_EDIT_ALL');
  const board = await computeFlipAlerts(session, now);
  const candidates: Candidate[] = [];

  // Follow-up tasks: hot leads without a next step, and new leads nobody wrote to.
  for (const alert of board.alerts) {
    if (alert.kind !== 'hot_lead_without_task' && alert.kind !== 'new_lead_without_contact') continue;
    const leadId = alert.href.split('leadId=')[1] ? decodeURIComponent(alert.href.split('leadId=')[1]) : null;
    if (!leadId) continue;
    candidates.push({
      kind: 'create_task',
      subjectKey: `create_task:${leadId}`,
      leadId,
      payload: { leadName: alert.title, assignedTo: alert.ownerId },
      reason: alert.kind === 'hot_lead_without_task'
        ? `Lead quente sem nenhuma tarefa marcada${alert.ownerName ? ` (com ${alert.ownerName})` : ''}.`
        : `${alert.detail}${alert.ownerName ? ` (com ${alert.ownerName})` : ''}.`,
    });
  }
  if (!seesTeam) return candidates;

  const loads = await attendantLoads(session.tenantId);
  const nameOf = new Map(loads.map((item) => [item.userId, item.name]));

  // Transfers: a customer waiting too long with an attendant, while another is clearly freer.
  const waiting = await prisma.conversation.findMany({
    where: {
      ...getInboxConversationWhere(await withInboxScope(session)),
      provider: 'meta',
      status: { not: 'resolved' },
      leadId: { not: null },
      lastInboundAt: { lte: new Date(now.getTime() - SUGGESTION_RULES.transferAfterHours * 3_600_000), gte: new Date(now.getTime() - DAY) },
    },
    select: { id: true, status: true, lastInboundAt: true, lastOutboundAt: true, lead: { select: { id: true, name: true, assignedTo: true } } },
    take: 100,
  });
  for (const conversation of waiting.filter((item) => isWaitingForAnswer({ ...item, now }))) {
    const lead = conversation.lead;
    if (!lead?.assignedTo) continue;
    const pair = lighterAttendant(lead.assignedTo, loads);
    if (!pair) continue;
    candidates.push({
      kind: 'transfer_lead',
      subjectKey: `transfer_lead:${lead.id}`,
      leadId: lead.id,
      payload: { leadName: lead.name, fromUserId: pair.owner.userId, toUserId: pair.target.userId, conversationId: conversation.id },
      reason: `${lead.name} espera resposta ${waitingFor(conversation.lastInboundAt!, now)}. ${pair.target.name} tem ${pair.target.openLeads} leads em aberto e ${pair.owner.name} tem ${pair.owner.openLeads}.`,
    });
  }

  // Rebalancing: an attendant well above the team average gives her stale leads to the freest one.
  const average = loads.length ? loads.reduce((sum, item) => sum + item.openLeads, 0) / loads.length : 0;
  for (const overloaded of loads.filter((item) => loads.length >= 2 && average > 0 && item.openLeads > average * FLIP_ALERT_RULES.overloadFactor)) {
    const target = loads.filter((item) => item.userId !== overloaded.userId).sort((a, b) => a.openLeads - b.openLeads)[0];
    if (!target) continue;
    const staleBefore = new Date(now.getTime() - FLIP_ALERT_RULES.staleLeadDays * DAY);
    const stale = await prisma.lead.findMany({
      where: { tenantId: session.tenantId, assignedTo: overloaded.userId, status: 'open', updatedAt: { lte: staleBefore } },
      orderBy: { updatedAt: 'asc' },
      take: SUGGESTION_RULES.maxRebalanceLeads,
      select: { id: true },
    });
    const count = rebalanceCount({ ownerOpen: overloaded.openLeads, average, staleAvailable: stale.length });
    if (!count) continue;
    candidates.push({
      kind: 'rebalance',
      subjectKey: `rebalance:${overloaded.userId}`,
      leadId: null,
      payload: { fromUserId: overloaded.userId, toUserId: target.userId, leadIds: stale.slice(0, count).map((lead) => lead.id) },
      reason: `${overloaded.name} está com ${overloaded.openLeads} leads em aberto (média da equipe: ${Math.round(average)}). Passar ${count} leads parados para ${nameOf.get(target.userId)}, que tem ${target.openLeads}.`,
    });
  }
  return candidates;
}

/**
 * Brings the suggestions up to date when someone opens the Flip: new ones are added, ones that no
 * longer apply expire, and a dismissed one does not come back for 7 days. Nothing is applied here.
 */
export async function refreshFlipSuggestions(session: Session, now = new Date()) {
  const candidates = await buildCandidates(session, now);
  const keys = candidates.map((candidate) => candidate.subjectKey);
  const recent = keys.length
    ? await prisma.flipSuggestion.findMany({
      where: { tenantId: session.tenantId, subjectKey: { in: keys } },
      orderBy: { createdAt: 'desc' },
      select: { subjectKey: true, status: true, createdAt: true, decidedAt: true },
    })
    : [];
  const lastByKey = new Map<string, (typeof recent)[number]>();
  for (const row of recent) if (!lastByKey.has(row.subjectKey)) lastByKey.set(row.subjectKey, row);

  for (const candidate of candidates) {
    if (!canSuggestAgain(lastByKey.get(candidate.subjectKey) || null, now)) continue;
    await prisma.flipSuggestion.create({
      data: {
        tenantId: session.tenantId,
        kind: candidate.kind,
        subjectKey: candidate.subjectKey,
        leadId: candidate.leadId,
        payload: candidate.payload as Prisma.InputJsonValue,
        reason: candidate.reason.slice(0, 500),
      },
    }).catch(() => undefined);
  }

  // Pending suggestions this person can see that no longer apply.
  const visibleKinds: SuggestionKind[] = can(session.role, 'LEADS_EDIT_ALL') ? ['create_task', 'transfer_lead', 'rebalance'] : ['create_task'];
  await prisma.flipSuggestion.updateMany({
    where: {
      tenantId: session.tenantId,
      status: 'pending',
      kind: { in: visibleKinds },
      subjectKey: { notIn: keys.length ? keys : ['-'] },
      ...(can(session.role, 'LEADS_EDIT_ALL') ? {} : { lead: { assignedTo: session.userId } }),
    },
    data: { status: 'expired', decidedAt: now },
  });
}

export async function listFlipSuggestions(session: Session) {
  const managers = can(session.role, 'LEADS_EDIT_ALL');
  const rows = await prisma.flipSuggestion.findMany({
    where: {
      tenantId: session.tenantId,
      status: 'pending',
      ...(managers ? {} : { kind: 'create_task', lead: { assignedTo: session.userId } }),
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, kind: true, reason: true, leadId: true, payload: true, createdAt: true, lead: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    reason: row.reason,
    leadId: row.leadId,
    leadName: row.lead?.name || null,
    createdAt: row.createdAt,
  }));
}

/** Aplicar or Dispensar every pending suggestion of one kind this person can act on (up to 50). */
export async function decideFlipSuggestionsOfKind(session: Session, kind: SuggestionKind, action: 'apply' | 'dismiss', ids?: string[]) {
  const only = ids?.length ? new Set(ids) : null;
  const visible = (await listFlipSuggestions(session)).filter((item) => item.kind === kind && (!only || only.has(item.id)));
  let done = 0;
  for (const item of visible) {
    const ok = action === 'apply'
      ? (await applyFlipSuggestion(session, item.id).catch(() => ({ ok: false }))).ok
      : await dismissFlipSuggestion(session, item.id).catch(() => false);
    if (ok) done += 1;
  }
  return { total: visible.length, done };
}

async function transferLeads(input: { tenantId: string; leadIds: string[]; fromUserId: string; toUserId: string; actorUserId: string; message: string }) {
  return prisma.$transaction(async (tx) => {
    const leads = await tx.lead.findMany({
      where: { tenantId: input.tenantId, id: { in: input.leadIds }, assignedTo: input.fromUserId, status: 'open' },
      select: { id: true },
    });
    const ids = leads.map((lead) => lead.id);
    if (!ids.length) return 0;
    await tx.lead.updateMany({ where: { tenantId: input.tenantId, id: { in: ids } }, data: { assignedTo: input.toUserId } });
    await tx.conversation.updateMany({ where: { tenantId: input.tenantId, leadId: { in: ids } }, data: { assignedTo: input.toUserId } });
    await tx.auditLog.createMany({
      data: ids.map((leadId) => ({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        entityType: 'lead',
        entityId: leadId,
        action: 'lead.updated',
        metadata: { changes: ['assignedTo'], assignedTo: input.toUserId, previousAssignedTo: input.fromUserId, message: input.message },
      })),
    });
    return ids.length;
  });
}

/** "Aplicar": checks the situation still holds, then does exactly what was suggested. */
export async function applyFlipSuggestion(session: Session, id: string, now = new Date()) {
  const suggestion = await prisma.flipSuggestion.findFirst({ where: { id, tenantId: session.tenantId, status: 'pending' } });
  if (!suggestion) return { ok: false as const, message: 'Esta sugestão já foi decidida ou não vale mais.' };
  const payload = (suggestion.payload && typeof suggestion.payload === 'object' ? suggestion.payload : {}) as Record<string, unknown>;
  const managers = can(session.role, 'LEADS_EDIT_ALL');
  let done = 0;

  if (suggestion.kind === 'create_task') {
    const lead = await prisma.lead.findFirst({
      where: { id: suggestion.leadId || '', tenantId: session.tenantId, status: 'open' },
      select: { id: true, name: true, assignedTo: true, tasks: { where: { status: { not: 'completed' }, completedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!lead || (!managers && lead.assignedTo !== session.userId)) return { ok: false as const, message: 'Lead não encontrado.' };
    if (lead.tasks.length === 0) {
      await prisma.task.create({
        data: {
          tenantId: session.tenantId,
          leadId: lead.id,
          assignedTo: lead.assignedTo || session.userId,
          createdBy: session.userId,
          title: `Retornar para ${lead.name}`,
          description: `Sugerido pelo Flip: ${suggestion.reason}`,
          dueDate: nextFollowUpSlot(now),
          priority: 'high',
        },
      });
      done = 1;
    }
  } else {
    if (!managers) return { ok: false as const, message: 'Só gestores aplicam transferências.' };
    const fromUserId = String(payload.fromUserId || '');
    const toUserId = String(payload.toUserId || '');
    const target = await prisma.tenantUser.findFirst({ where: { tenantId: session.tenantId, userId: toUserId, role: 'agent', status: 'active' } });
    if (!target) return { ok: false as const, message: 'A atendente de destino não está mais ativa.' };
    const leadIds = suggestion.kind === 'transfer_lead'
      ? [suggestion.leadId || '']
      : (Array.isArray(payload.leadIds) ? payload.leadIds.map(String) : []);
    if (suggestion.kind === 'transfer_lead') {
      // Only while the customer is still waiting for an answer.
      const conversation = await prisma.conversation.findFirst({
        where: { id: String(payload.conversationId || ''), tenantId: session.tenantId },
        select: { status: true, lastInboundAt: true, lastOutboundAt: true },
      });
      if (!conversation || !isWaitingForAnswer({ ...conversation, now })) {
        await prisma.flipSuggestion.update({ where: { id: suggestion.id }, data: { status: 'expired', decidedAt: now } });
        return { ok: false as const, message: 'O cliente já foi respondido; a sugestão não vale mais.' };
      }
    }
    done = await transferLeads({
      tenantId: session.tenantId, leadIds, fromUserId, toUserId, actorUserId: session.userId,
      message: suggestion.kind === 'transfer_lead' ? 'Transferido por sugestão do Flip.' : 'Carteira redistribuída por sugestão do Flip.',
    });
  }

  await prisma.flipSuggestion.update({
    where: { id: suggestion.id },
    data: { status: done ? 'applied' : 'expired', decidedBy: session.userId, decidedAt: now },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'flip_suggestion', entityId: suggestion.id,
      action: done ? 'flip.suggestion_applied' : 'flip.suggestion_expired',
      metadata: { kind: suggestion.kind, reason: suggestion.reason, affected: done },
    },
  }).catch(() => undefined);
  return done
    ? { ok: true as const, message: suggestion.kind === 'create_task' ? 'Tarefa criada.' : `${done} lead(s) transferido(s).` }
    : { ok: false as const, message: 'A situação mudou; nada precisou ser feito.' };
}

export async function dismissFlipSuggestion(session: Session, id: string) {
  const managers = can(session.role, 'LEADS_EDIT_ALL');
  const updated = await prisma.flipSuggestion.updateMany({
    where: {
      id, tenantId: session.tenantId, status: 'pending',
      ...(managers ? {} : { kind: 'create_task', lead: { assignedTo: session.userId } }),
    },
    data: { status: 'dismissed', decidedBy: session.userId, decidedAt: new Date() },
  });
  if (updated.count) {
    await prisma.auditLog.create({
      data: { tenantId: session.tenantId, userId: session.userId, entityType: 'flip_suggestion', entityId: id, action: 'flip.suggestion_dismissed' },
    }).catch(() => undefined);
  }
  return updated.count > 0;
}
