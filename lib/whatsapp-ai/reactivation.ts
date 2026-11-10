import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { loadLatestConversationMemory } from '@/lib/flip-ai/conversation-memory';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { isTestPhoneNumber } from './eligibility';
import { isConversationAiPaused } from './pause';
import { conversationDocumentContext } from './documents';
import {
  cleanReactivationText,
  earlyReactivationDue,
  earlyReactivationKey,
  REACTIVATION_AFTER_HOURS,
  REACTIVATION_EARLY_AFTER_HOURS,
  REACTIVATION_LAST_MINUTE,
  reactivationDue,
  reactivationInstructions,
  reactivationKey,
  type ReactivationMoment,
} from './reactivation-rules';

const OPERATION = 'whatsapp_reactivation';

function firstName(value: string | null | undefined) {
  const name = (value || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/)[0] || '';
  return name.length >= 2 ? name : null;
}

async function transcript(tenantId: string, conversationId: string) {
  const messages = await prisma.message.findMany({
    where: { tenantId, conversationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { direction: true, type: true, text: true },
  });
  return messages.reverse().map((message) => {
    const who = message.direction === 'inbound' ? 'Cliente' : 'Empresa';
    const body = message.text?.trim() || (message.type !== 'text' ? `[${message.type}]` : '');
    return body ? `${who}: ${body.slice(0, 400)}` : '';
  }).filter(Boolean).join('\n');
}

/** What the conversation engine (JEV) read of the last answered moment of this conversation. */
async function lastMoment(tenantId: string, conversationId: string): Promise<ReactivationMoment | null> {
  const event = await prisma.flipAiUsageEvent.findFirst({
    where: { tenantId, conversationId, operation: 'chat_response', status: 'confirmed' },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  }).catch(() => null);
  const metadata = event?.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? event.metadata as Record<string, unknown> : null;
  const decision = metadata?.decisionSnapshot && typeof metadata.decisionSnapshot === 'object'
    ? metadata.decisionSnapshot as Record<string, unknown> : null;
  if (!decision) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return { intent: text(decision.intent), objection: text(decision.objection), journeyStage: text(decision.journeyStage), nextAction: text(decision.nextAction) };
}

/**
 * "Mensagem de reativação": for each number with the option on, conversations where the company
 * spoke last and the customer went silent get, inside the free 24-hour window, a same-day reminder
 * (after 3 hours, in business hours) and a last one at 23 hours. Each is written by the AI from
 * where the conversation stopped: the documents still missing, the moment the conversation engine
 * read and what is pending. Called by the scheduler.
 */
export async function sweepWhatsAppReactivations(now = new Date()) {
  const numbers = await prisma.tenantWhatsAppAiSettings.findMany({
    where: { enabled: true, reactivationEnabled: true, agentId: { not: null }, connection: { status: 'connected' } },
    select: { tenantId: true, agentId: true, liveEnabled: true, testPhoneNumbers: true, resumeAfterHours: true, connection: { select: { phoneNumberId: true } } },
  });
  let sent = 0;
  for (const number of numbers) {
    const wallet = await getFlipAiCreditBalanceForTenant(number.tenantId).catch(() => null);
    if (!wallet?.available || wallet.balanceCredits <= 0) continue;
    const agent = await prisma.flipAiAgent.findFirst({
      where: { id: number.agentId!, tenantId: number.tenantId, status: 'published' },
      select: { id: true, name: true, tenant: { select: { name: true } } },
    });
    if (!agent) continue;

    const candidates = await prisma.conversation.findMany({
      where: {
        tenantId: number.tenantId, provider: 'meta', channel: 'whatsapp',
        // A resolved conversation never gets a reminder.
        status: { not: 'resolved' },
        lastInboundAt: {
          lte: new Date(now.getTime() - REACTIVATION_EARLY_AFTER_HOURS * 3_600_000),
          gte: new Date(now.getTime() - REACTIVATION_LAST_MINUTE * 60_000),
        },
      },
      orderBy: { lastInboundAt: 'asc' },
      take: 60,
      select: {
        id: true, lastInboundAt: true, lastOutboundAt: true, aiPausedAt: true, aiPauseReason: true,
        externalContactIdentity: { select: { externalUserId: true, displayName: true } },
        lead: { select: { name: true, status: true, stage: { select: { name: true } } } },
        messages: {
          where: { direction: 'inbound' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { metadata: true },
        },
      },
    });

    for (const conversation of candidates) {
      const candidate = {
        lastInboundAt: conversation.lastInboundAt,
        lastOutboundAt: conversation.lastOutboundAt,
        leadStatus: conversation.lead ? String(conversation.lead.status) : null,
        leadStageName: conversation.lead?.stage?.name ?? null,
      };
      const kind: 'early' | 'last' | null = reactivationDue(candidate, now) ? 'last' : earlyReactivationDue(candidate, now) ? 'early' : null;
      if (!kind) continue;
      // A person is handling it (AI paused or the conversation was resolved): the AI stays quiet.
      if (isConversationAiPaused(conversation, number.resumeAfterHours, now)) continue;
      // Only conversations of this number, and only customers the AI may talk to.
      const inboundMeta = conversation.messages[0]?.metadata as Record<string, unknown> | null;
      if (inboundMeta?.phoneNumberId && inboundMeta.phoneNumberId !== number.connection.phoneNumberId) continue;
      if (!number.liveEnabled && !isTestPhoneNumber(number.testPhoneNumbers, conversation.externalContactIdentity.externalUserId)) continue;

      // One reminder of each kind per silence: the usage record is the lock (its request key is unique).
      const requestKey = kind === 'last'
        ? reactivationKey(conversation.id, conversation.lastInboundAt!)
        : earlyReactivationKey(conversation.id, conversation.lastInboundAt!);
      let eventId: string;
      try {
        eventId = (await prisma.flipAiUsageEvent.create({
          data: {
            tenantId: number.tenantId, agentId: agent.id, conversationId: conversation.id, requestKey,
            operation: OPERATION, provider: 'openai', model: 'pending', status: 'processing', units: 1,
            metadata: { channel: 'whatsapp', kind } as Prisma.InputJsonValue,
          },
          select: { id: true },
        })).id;
      } catch {
        continue;
      }

      try {
        const [history, documents, memory, moment] = await Promise.all([
          transcript(number.tenantId, conversation.id),
          conversationDocumentContext(number.tenantId, conversation.id).catch(() => null),
          loadLatestConversationMemory({ tenantId: number.tenantId, conversationId: conversation.id }).catch(() => null),
          lastMoment(number.tenantId, conversation.id),
        ]);
        const name = firstName(conversation.lead?.name) || firstName(conversation.externalContactIdentity.displayName);
        const model = (await getActiveFlipAiTextModel()).model;
        const result = await streamOpenAiText({
          instructions: reactivationInstructions({
            companyName: agent.tenant.name,
            name,
            kind,
            stageName: conversation.lead?.stage?.name ?? null,
            documents: documents?.checklist ? documents.text : null,
            moment,
            pending: (memory?.pending || []).map((item) => item.value).slice(0, 6),
          }),
          messages: [{ role: 'user', content: history || 'Sem histórico de texto.' }],
        }, () => undefined, { model, timeoutMs: 25_000, maxOutputTokens: 250, safetyIdentifier: conversation.id });
        const text = cleanReactivationText(result.text);
        if (!text) throw new Error('empty');

        const delivery = await enqueueAndDispatchWhatsAppTextMessage({
          tenantId: number.tenantId,
          conversationId: conversation.id,
          requestedByUserId: '',
          text,
          idempotencyKey: requestKey,
          aiSender: { agentId: agent.id, agentName: agent.name },
        });
        await prisma.flipAiUsageEvent.update({
          where: { id: eventId },
          data: {
            model: result.model, status: 'confirmed', inputTokens: result.inputTokens, outputTokens: result.outputTokens,
            metadata: { channel: 'whatsapp', kind, delivery: delivery.status } as Prisma.InputJsonValue,
          },
        });
        await settleFlipAiUsageCharge({ tenantId: number.tenantId, eventId }).catch(() => undefined);
        if (delivery.status !== 'failed') {
          sent += 1;
          await prisma.auditLog.create({
            data: {
              tenantId: number.tenantId, entityType: 'conversation', entityId: conversation.id,
              action: 'whatsapp_ai.reactivation_sent',
              metadata: { kind, hours: kind === 'last' ? REACTIVATION_AFTER_HOURS : REACTIVATION_EARLY_AFTER_HOURS },
            },
          }).catch(() => undefined);
        }
      } catch {
        await prisma.flipAiUsageEvent.update({ where: { id: eventId }, data: { status: 'failed' } }).catch(() => undefined);
      }
    }
  }
  return { numbers: numbers.length, sent };
}
