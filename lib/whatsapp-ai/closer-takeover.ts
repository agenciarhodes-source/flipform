import 'server-only';

import { prisma } from '@/lib/prisma';
import { isOutcomeStageName } from './stage-rules';
import { isTeamMessage } from '@/lib/flip-ai/history-content';
import { closerTakeoverEligible, TAKEOVER_MAX_PER_SWITCH, TAKEOVER_WINDOW_HOURS } from './closer-takeover-rules';
import { replyToWhatsAppConversation } from './reply';

/**
 * The conversations an attendant switched to Closer takes back (see closer-takeover-rules):
 * of the WhatsApp numbers that use this attendant, triaged leads the AI handed over less than
 * 23 hours ago, with nobody of the team in the conversation since.
 */
export async function closerTakeoverCandidates(tenantId: string, agentId: string, now = new Date()) {
  const numbers = await prisma.tenantWhatsAppAiSettings.findMany({
    where: { tenantId, agentId, enabled: true },
    select: { connection: { select: { phoneNumberId: true } } },
  });
  const phoneNumberIds = new Set(numbers.map((number) => number.connection.phoneNumberId));
  if (!phoneNumberIds.size) return [];

  const conversations = await prisma.conversation.findMany({
    where: {
      tenantId, provider: 'meta', channel: 'whatsapp', status: { not: 'resolved' }, aiPausedAt: null,
      leadId: { not: null },
      lastInboundAt: { gte: new Date(now.getTime() - TAKEOVER_WINDOW_HOURS * 3_600_000) },
    },
    orderBy: { lastInboundAt: 'desc' },
    take: 100,
    select: {
      id: true, status: true, aiPausedAt: true, lastInboundAt: true,
      lead: { select: { stage: { select: { name: true, orderIndex: true, pipelineId: true } } } },
    },
  });

  const firstStageOrder = new Map<string, number>();
  const ids: Array<{ conversationId: string; inboundMessageId: string }> = [];
  for (const conversation of conversations) {
    const stage = conversation.lead?.stage;
    if (!stage) continue;
    if (!firstStageOrder.has(stage.pipelineId)) {
      const first = await prisma.pipelineStage.findFirst({
        where: { pipelineId: stage.pipelineId, isArchived: false },
        orderBy: { orderIndex: 'asc' },
        select: { orderIndex: true },
      });
      firstStageOrder.set(stage.pipelineId, first?.orderIndex ?? stage.orderIndex);
    }
    const messages = await prisma.message.findMany({
      where: { tenantId, conversationId: conversation.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 60,
      select: { id: true, direction: true, type: true, text: true, metadata: true, sentByUserId: true },
    });
    const lastInbound = messages.find((message) => message.direction === 'inbound');
    const lastOutbound = messages.find((message) => message.direction === 'outbound');
    const inboundNumber = (lastInbound?.metadata as Record<string, unknown> | null)?.phoneNumberId;
    if (typeof inboundNumber === 'string' && !phoneNumberIds.has(inboundNumber)) continue;
    const eligible = closerTakeoverEligible({
      status: conversation.status,
      aiPaused: Boolean(conversation.aiPausedAt),
      lastInboundAt: conversation.lastInboundAt,
      aiSpokeLast: Boolean(lastOutbound && typeof (lastOutbound.metadata as Record<string, unknown> | null)?.aiAgentId === 'string'
        && messages.indexOf(lastOutbound) < messages.indexOf(lastInbound!)),
      aiLastWasQuestion: /\?\s*$/.test(lastOutbound?.text?.trim() || ''),
      teamInvolved: messages.some((message) => isTeamMessage(message)),
      stage: {
        isFirst: stage.orderIndex <= (firstStageOrder.get(stage.pipelineId) ?? stage.orderIndex),
        isOutcome: isOutcomeStageName(stage.name),
      },
    }, now);
    if (eligible && lastInbound) ids.push({ conversationId: conversation.id, inboundMessageId: lastInbound.id });
    if (ids.length >= TAKEOVER_MAX_PER_SWITCH) break;
  }
  return ids;
}

/** Runs the takeover one conversation after the other (each goes through every usual AI check). */
export async function runCloserTakeover(tenantId: string, items: Array<{ conversationId: string; inboundMessageId: string }>) {
  let replied = 0;
  for (const item of items) {
    const outcome = await replyToWhatsAppConversation({ tenantId, ...item, trigger: 'closer_takeover' })
      .catch(() => ({ replied: false }));
    if (outcome.replied) replied += 1;
  }
  return { replied };
}
