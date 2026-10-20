import 'server-only';

import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { getInboxConversationWhere, withInboxScope } from '@/lib/inbox/access';
import { isWaitingForAnswer } from '@/lib/inbox/unanswered';
import { FLIP_ALERT_ORDER, FLIP_ALERT_RULES, overloadedAttendants, waitingFor, type FlipAlert } from './alert-rules';

const MAX_PER_KIND = 50;
const DAY = 86_400_000;

type Scope = { tenantId: string; userId: string; role: string };

/**
 * What is falling behind, for the person signed in: an attendant sees hers, a manager the whole
 * team. Read only: the Flip shows, it never changes anything by itself.
 */
export async function computeFlipAlerts(session: Scope, now = new Date()) {
  const seesTeam = can(session.role, 'LEADS_VIEW_ALL');
  const own = seesTeam ? {} : { assignedTo: session.userId };
  const alerts: FlipAlert[] = [];

  const users = await prisma.tenantUser.findMany({
    where: { tenantId: session.tenantId },
    select: { userId: true, role: true, status: true, user: { select: { name: true } } },
  });
  const nameOf = new Map(users.map((member) => [member.userId, member.user.name]));

  // Conversations waiting for an answer.
  const conversations = await prisma.conversation.findMany({
    where: {
      ...getInboxConversationWhere(await withInboxScope(session)),
      provider: 'meta',
      channel: { in: ['whatsapp', 'instagram'] },
      status: { not: 'resolved' },
      lastInboundAt: {
        lte: new Date(now.getTime() - FLIP_ALERT_RULES.unansweredMinutes * 60_000),
        gte: new Date(now.getTime() - DAY),
      },
    },
    orderBy: { lastInboundAt: 'asc' },
    take: 200,
    select: {
      id: true, status: true, lastInboundAt: true, lastOutboundAt: true, assignedTo: true,
      lead: { select: { name: true, assignedTo: true } },
      externalContactIdentity: { select: { displayName: true, phone: true, externalUserId: true } },
    },
  });
  for (const conversation of conversations.filter((item) => isWaitingForAnswer({ ...item, now })).slice(0, MAX_PER_KIND)) {
    const ownerId = conversation.assignedTo || conversation.lead?.assignedTo || null;
    const contact = conversation.lead?.name || conversation.externalContactIdentity.displayName
      || conversation.externalContactIdentity.phone || conversation.externalContactIdentity.externalUserId;
    alerts.push({
      kind: 'unanswered_conversation',
      id: `conversation:${conversation.id}`,
      title: contact,
      detail: `Escreveu ${waitingFor(conversation.lastInboundAt!, now)} e ainda não teve resposta`,
      href: `/inbox?conversationId=${encodeURIComponent(conversation.id)}`,
      ownerId,
      ownerName: ownerId ? nameOf.get(ownerId) || null : null,
      since: conversation.lastInboundAt?.toISOString() || null,
    });
  }

  // Follow-ups past their date.
  const tasks = await prisma.task.findMany({
    where: {
      tenantId: session.tenantId,
      ...own,
      status: { not: 'completed' },
      completedAt: null,
      dueDate: { lt: now },
    },
    orderBy: { dueDate: 'asc' },
    take: MAX_PER_KIND,
    select: { id: true, title: true, dueDate: true, leadId: true, assignedTo: true, lead: { select: { name: true } } },
  });
  for (const task of tasks) {
    alerts.push({
      kind: 'overdue_task',
      id: `task:${task.id}`,
      title: task.title,
      detail: `${task.lead?.name ? `${task.lead.name} · ` : ''}venceu ${waitingFor(task.dueDate!, now)}`,
      href: task.leadId ? `/leads?leadId=${encodeURIComponent(task.leadId)}` : '/leads',
      ownerId: task.assignedTo,
      ownerName: task.assignedTo ? nameOf.get(task.assignedTo) || null : null,
      since: task.dueDate?.toISOString() || null,
    });
  }

  // Hot leads without a next step.
  const hotLeads = await prisma.lead.findMany({
    where: {
      tenantId: session.tenantId,
      ...own,
      status: 'open',
      temperature: 'hot',
      tasks: { none: { status: { not: 'completed' }, completedAt: null } },
    },
    orderBy: { updatedAt: 'asc' },
    take: MAX_PER_KIND,
    select: { id: true, name: true, assignedTo: true, updatedAt: true },
  });
  for (const lead of hotLeads) {
    alerts.push({
      kind: 'hot_lead_without_task',
      id: `hot:${lead.id}`,
      title: lead.name,
      detail: 'Lead quente sem nenhuma tarefa marcada',
      href: `/leads?leadId=${encodeURIComponent(lead.id)}`,
      ownerId: lead.assignedTo,
      ownerName: lead.assignedTo ? nameOf.get(lead.assignedTo) || null : null,
      since: lead.updatedAt.toISOString(),
    });
  }

  // New leads nobody wrote to yet.
  const newLeads = await prisma.lead.findMany({
    where: {
      tenantId: session.tenantId,
      ...own,
      status: 'open',
      createdAt: {
        lte: new Date(now.getTime() - FLIP_ALERT_RULES.newLeadWithoutContactHours * 3_600_000),
        gte: new Date(now.getTime() - FLIP_ALERT_RULES.newLeadLookbackDays * DAY),
      },
      conversations: { none: { lastOutboundAt: { not: null } } },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_KIND,
    select: { id: true, name: true, assignedTo: true, createdAt: true },
  });
  for (const lead of newLeads) {
    alerts.push({
      kind: 'new_lead_without_contact',
      id: `new:${lead.id}`,
      title: lead.name,
      detail: `Chegou ${waitingFor(lead.createdAt, now)} e ninguém mandou mensagem`,
      href: `/leads?leadId=${encodeURIComponent(lead.id)}`,
      ownerId: lead.assignedTo,
      ownerName: lead.assignedTo ? nameOf.get(lead.assignedTo) || null : null,
      since: lead.createdAt.toISOString(),
    });
  }

  // Leads standing still in the same stage.
  const staleBefore = new Date(now.getTime() - FLIP_ALERT_RULES.staleLeadDays * DAY);
  const staleAfter = new Date(now.getTime() - FLIP_ALERT_RULES.staleLeadLookbackDays * DAY);
  const openLeads = await prisma.lead.findMany({
    where: { tenantId: session.tenantId, ...own, status: 'open', createdAt: { lte: staleBefore } },
    select: {
      id: true, name: true, assignedTo: true, createdAt: true,
      stage: { select: { name: true } },
      history: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
    take: 2_000,
  });
  const stale = openLeads
    .map((lead) => ({ lead, lastMove: lead.history[0]?.createdAt || lead.createdAt }))
    .filter(({ lastMove }) => lastMove <= staleBefore && lastMove >= staleAfter)
    .sort((a, b) => a.lastMove.getTime() - b.lastMove.getTime())
    .slice(0, MAX_PER_KIND);
  for (const { lead, lastMove } of stale) {
    alerts.push({
      kind: 'stale_lead',
      id: `stale:${lead.id}`,
      title: lead.name,
      detail: `Parado em "${lead.stage.name}" ${waitingFor(lastMove, now)}`,
      href: `/leads?leadId=${encodeURIComponent(lead.id)}`,
      ownerId: lead.assignedTo,
      ownerName: lead.assignedTo ? nameOf.get(lead.assignedTo) || null : null,
      since: lastMove.toISOString(),
    });
  }

  // Managers also see attendants carrying much more than the rest of the team.
  if (seesTeam) {
    const attendants = users.filter((member) => member.role === 'agent' && member.status === 'active');
    const counts = await prisma.lead.groupBy({
      by: ['assignedTo'],
      where: { tenantId: session.tenantId, status: 'open', assignedTo: { in: attendants.map((member) => member.userId) } },
      _count: { _all: true },
    });
    const byUser = new Map(counts.map((row) => [row.assignedTo, row._count._all]));
    for (const item of overloadedAttendants(attendants.map((member) => ({
      userId: member.userId, name: member.user.name, openLeads: byUser.get(member.userId) || 0,
    })))) {
      alerts.push({
        kind: 'overloaded_attendant',
        id: `overload:${item.userId}`,
        title: item.name,
        detail: `${item.openLeads} leads em aberto (média da equipe: ${item.average})`,
        href: '/team',
        ownerId: item.userId,
        ownerName: item.name,
        since: null,
      });
    }
  }

  alerts.sort((a, b) => FLIP_ALERT_ORDER.indexOf(a.kind) - FLIP_ALERT_ORDER.indexOf(b.kind));
  return { seesTeam, alerts, total: alerts.length, generatedAt: now.toISOString() };
}
