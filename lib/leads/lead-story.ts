import 'server-only';

import { prisma } from '@/lib/prisma';
import { leadDocumentsView } from '@/lib/whatsapp-ai/documents';
import { itemKey } from '@/lib/whatsapp-ai/document-rules';
import { buildLeadStory, type LeadStory } from './lead-story-rules';

const EVENT_ACTIONS = ['whatsapp_ai.reactivation_sent', 'closing_documents.sent', 'contracts.sent', 'contracts.signed'];

/** "Resumo do cliente" of one lead, from what the system already recorded (no AI call). */
export async function leadStory(tenantId: string, leadId: string): Promise<LeadStory | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      name: true, createdAt: true, source: true, status: true, assignedTo: true,
      stage: { select: { name: true } },
      conversations: { select: { id: true, channel: true, provider: true, createdAt: true, lastInboundAt: true, lastOutboundAt: true } },
    },
  });
  if (!lead) return null;
  const ids = lead.conversations.map((conversation) => conversation.id);

  const [assigned, documents, arrivals, moves, tasks, audits, followups, lastInbound, calls] = await Promise.all([
    lead.assignedTo ? prisma.user.findUnique({ where: { id: lead.assignedTo }, select: { name: true } }).catch(() => null) : null,
    leadDocumentsView(tenantId, leadId).catch(() => ({ cases: [] as Awaited<ReturnType<typeof leadDocumentsView>>['cases'] })),
    ids.length
      ? prisma.leadDocument.findMany({
        where: { tenantId, conversationId: { in: ids }, status: 'received' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, detectedType: true, itemKey: true, checklistId: true },
      }).catch(() => [])
      : [],
    prisma.leadStageHistory.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, toStage: { select: { name: true } }, changer: { select: { name: true } } },
    }).catch(() => []),
    prisma.task.findMany({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, title: true, status: true },
    }).catch(() => []),
    ids.length
      ? prisma.auditLog.findMany({
        where: { tenantId, entityType: 'conversation', entityId: { in: ids }, action: { in: EVENT_ACTIONS } },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { createdAt: true, action: true },
      }).catch(() => [])
      : [],
    ids.length
      ? prisma.$queryRaw<Array<{ created_at: Date }>>`
        SELECT created_at FROM whatsapp_followup_sends
        WHERE tenant_id = ${tenantId} AND conversation_id = ANY(${ids}) AND status = 'sent'`.catch(() => [])
      : [],
    ids.length
      ? prisma.message.findFirst({
        where: { tenantId, conversationId: { in: ids }, direction: 'inbound' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, text: true, type: true },
      }).catch(() => null)
      : null,
    prisma.$queryRaw<Array<{ created_at: Date; outcome: string; note: string | null; user_name: string | null }>>`
      SELECT c.created_at, c.outcome, c.note, u.name AS user_name FROM lead_calls c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.tenant_id = ${tenantId} AND c.lead_id = ${leadId} ORDER BY c.created_at DESC LIMIT 20`.catch(() => []),
  ]);

  const firstCase = documents.cases[0] || null;

  const lastOutboundAt = lead.conversations
    .map((conversation) => conversation.lastOutboundAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const mediaWord: Record<string, string> = { image: '[foto]', document: '[documento]', audio: '[áudio]', video: '[vídeo]' };

  return buildLeadStory({
    name: lead.name,
    createdAt: lead.createdAt,
    source: lead.source,
    assignedName: assigned?.name || null,
    stageName: lead.stage?.name || null,
    status: String(lead.status),
    channels: lead.conversations.map((conversation) => ({ channel: conversation.channel, provider: conversation.provider, firstAt: conversation.createdAt })),
    documents: firstCase
      ? {
        caseName: firstCase.name,
        received: firstCase.items.filter((item) => item.status === 'received').map((item) => item.label),
        missing: firstCase.items.filter((item) => item.status === 'missing').map((item) => item.label),
        problems: firstCase.items.filter((item) => item.status === 'unreadable' || item.status === 'problem').map((item) => item.label),
      }
      : null,
    documentArrivals: arrivals.map((arrival) => {
      const label = (arrival.itemKey && firstCase?.items.find((entry) => itemKey(entry.label) === arrival.itemKey)?.label)
        || arrival.detectedType || 'documento';
      return { at: arrival.createdAt, label: label.replace(/^[•\s]+/, '') };
    }),
    stageMoves: moves.map((move) => ({ at: move.createdAt, stage: move.toStage.name, by: move.changer?.name || null })),
    tasks: tasks.map((task) => ({ at: task.createdAt, title: task.title, done: task.status === 'completed' })),
    events: [
      ...audits.map((entry) => ({ at: entry.createdAt, action: entry.action })),
      ...followups.map((entry) => ({ at: entry.created_at, action: 'whatsapp_followup.sent' })),
    ],
    lastInbound: lastInbound
      ? { at: lastInbound.createdAt, text: lastInbound.text?.trim() || mediaWord[lastInbound.type] || `[${lastInbound.type}]` }
      : null,
    lastOutboundAt,
    calls: calls.map((call) => ({ at: call.created_at, outcome: call.outcome, userName: call.user_name, note: call.note })),
  });
}
