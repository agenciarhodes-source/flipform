import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolvePublicFlipAiRuntime, type PublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import {
  buildPublicChatContext,
  completePublicChatTurn,
  failPublicChatTurn,
  parsePublicChatDecision,
  PUBLIC_CHAT_DECISION_FORMAT,
  type PreparedPublicChatTurn,
} from '@/lib/flip-ai/public-chat';
import {
  assertFlipAiConversationRuntimeReady,
  executeFlipAiConversationResponse,
  FlipAiConversationRuntimeError,
} from '@/lib/flip-ai/conversation-runtime';
import { OpenAiResponseError } from '@/lib/flip-ai/openai-responses';
import { FLIP_AI_HUMAN_CONVERSATION_POLICY_VERSION } from '@/lib/flip-ai/conversation-style';
import { enqueueAndDispatchInstagramTextMessage } from '@/lib/meta/instagram-outbound';
import { getInstagramSendConnection } from '@/lib/meta/instagram-send-credentials';
import { isConversationAiPaused } from '@/lib/whatsapp-ai/pause';
import { clearFirstName } from '@/lib/whatsapp-ai/name-clarity';
import { whatsappIntroduction } from '@/lib/whatsapp-ai/reply';
import { instagramSenderProfile } from './profile';
import { tenantMayRunAiAttendant } from '@/lib/billing/plan-access';
import {
  INSTAGRAM_AI_QUIET_SECONDS,
  INSTAGRAM_AI_WINDOW_HOURS,
  INSTAGRAM_MEDIA_NOTES,
  instagramAiMayAnswer,
  instagramInstructions,
  toInstagramText,
} from './rules';

/**
 * The Flip AI answering the Instagram Direct. Global for every company: it uses the attendant
 * chosen for the Instagram account (Atendimento Instagram) and that attendant's Master Markdown.
 * Same safeguards as WhatsApp: only the person's latest message, only if nobody answered after
 * it, inside Meta's 24 h window, never while the team has the conversation, within the daily limit.
 */

type ExecuteTurn = Extract<PreparedPublicChatTurn, { mode: 'execute' }>;
export type InstagramAiOutcome = { replied: boolean; reason: string };
export type InstagramAiTrigger = 'message' | 'sweep' | 'handback';

const TIMEZONE = 'America/Sao_Paulo';

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function metadataOf(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function startOfBrasiliaDay(now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${day}T00:00:00-03:00`);
}

async function creditsSpentToday(tenantId: string, connectionId: string, now: Date) {
  const rows = await prisma.$queryRaw<Array<{ spent: bigint | number | null }>>(Prisma.sql`
    SELECT COALESCE(SUM(ledger.amount_credits), 0) AS spent
    FROM flip_ai_credit_ledger AS ledger
    JOIN flip_ai_usage_events AS event ON event.id = ledger.reference_id
    WHERE ledger.tenant_id = ${tenantId}
      AND ledger.entry_type = 'debit'
      AND ledger.created_at >= ${startOfBrasiliaDay(now)}
      AND event.metadata->>'instagramConnectionId' = ${connectionId}
  `);
  return Number(rows[0]?.spent || 0);
}

export async function replyToInstagramConversation(input: {
  tenantId: string;
  conversationId: string;
  /** The message that started this run; a newer one takes over the reply. */
  inboundMessageId: string;
  trigger: InstagramAiTrigger;
  now?: Date;
}): Promise<InstagramAiOutcome> {
  const now = input.now || new Date();
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId, provider: 'meta', channel: 'instagram' },
    select: {
      id: true, aiPausedAt: true, aiPauseReason: true,
      externalContactIdentity: { select: { id: true, externalUserId: true, username: true, displayName: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!conversation) return { replied: false, reason: 'conversation_not_found' };

  // Only the latest message of the person answers, and only if nobody (person or AI) answered after it.
  const [latestInbound, latestOutbound] = await Promise.all([
    prisma.message.findFirst({
      where: { tenantId: input.tenantId, conversationId: conversation.id, direction: 'inbound' },
      orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true, providerTimestamp: true, createdAt: true, metadata: true },
    }),
    prisma.message.findFirst({
      where: { tenantId: input.tenantId, conversationId: conversation.id, direction: 'outbound' },
      orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true, providerTimestamp: true, createdAt: true },
    }),
  ]);
  if (!latestInbound || latestInbound.id !== input.inboundMessageId) return { replied: false, reason: 'newer_message' };
  const inboundAt = latestInbound.providerTimestamp || latestInbound.createdAt;
  const outboundAt = latestOutbound ? latestOutbound.providerTimestamp || latestOutbound.createdAt : null;
  if (outboundAt && outboundAt >= inboundAt) return { replied: false, reason: 'already_answered' };
  if (now.getTime() - inboundAt.getTime() > INSTAGRAM_AI_WINDOW_HOURS * 3_600_000) return { replied: false, reason: 'window_closed' };
  // A keyword automation already answers this message: the AI does not answer on top of it.
  if (metadataOf(latestInbound.metadata).automationMatched === true) return { replied: false, reason: 'automation' };

  const accountId = metadataOf(latestInbound.metadata).instagramProfessionalAccountId;
  const connection = typeof accountId === 'string'
    ? await prisma.tenantInstagramConnection.findFirst({
      where: { tenantId: input.tenantId, instagramUserId: accountId, status: 'connected' },
      select: { id: true, aiSettings: true },
    })
    : null;
  const settings = connection?.aiSettings;
  if (!connection || !settings || !settings.enabled || !settings.agentId) return { replied: false, reason: 'not_configured' };
  // The AI answers only for Premium (or an authorized pilot); otherwise the team answers.
  if (!(await tenantMayRunAiAttendant(input.tenantId))) return { replied: false, reason: 'plan_required' };
  if (isConversationAiPaused(conversation, settings.resumeAfterHours, now)) return { replied: false, reason: 'paused' };

  const send = await getInstagramSendConnection(input.tenantId);
  if (!send || send.id !== connection.id) return { replied: false, reason: 'not_connected' };

  // The @ (test profiles) and the name, read from Meta once and kept on the contact.
  const profile = await instagramSenderProfile({ tenantId: input.tenantId, identity: conversation.externalContactIdentity, accessToken: send.accessToken });
  const allowed = instagramAiMayAnswer({
    enabled: settings.enabled,
    agentId: settings.agentId,
    liveEnabled: settings.liveEnabled,
    testUsernames: settings.testUsernames,
    senderUsername: profile.username,
  });
  if (!allowed.answer) return { replied: false, reason: allowed.reason };
  if (settings.dailyCreditLimit && await creditsSpentToday(input.tenantId, connection.id, now) >= settings.dailyCreditLimit) {
    return { replied: false, reason: 'daily_limit' };
  }

  // The attendant chosen for the account, only while it is published and the company may use the Flip AI.
  const endpoint = await prisma.flipAiEndpoint.findFirst({
    where: { tenantId: input.tenantId, agentId: settings.agentId },
    select: { slug: true },
  });
  const runtime: PublicFlipAiRuntime | null = endpoint ? await resolvePublicFlipAiRuntime({ slug: endpoint.slug }) : null;
  if (!runtime || runtime.tenantId !== input.tenantId) return { replied: false, reason: 'agent_unavailable' };
  let plan;
  try {
    plan = await assertFlipAiConversationRuntimeReady({ tenantId: input.tenantId });
  } catch {
    return { replied: false, reason: 'runtime_unavailable' };
  }

  // Everything the person sent since the last answer is read together, as one turn.
  const pending = await prisma.message.findMany({
    where: {
      tenantId: input.tenantId,
      conversationId: conversation.id,
      direction: 'inbound',
      ...(outboundAt ? { OR: [{ providerTimestamp: { gt: outboundAt } }, { providerTimestamp: null, createdAt: { gt: outboundAt } }] } : {}),
    },
    orderBy: [{ providerTimestamp: 'asc' }, { createdAt: 'asc' }],
    take: 20,
    select: { type: true, text: true },
  });
  const parts: string[] = [];
  const notes: string[] = [];
  for (const message of pending) {
    if (message.text?.trim()) parts.push(message.text.trim());
    else notes.push(INSTAGRAM_MEDIA_NOTES[message.type] || INSTAGRAM_MEDIA_NOTES.unknown);
  }
  if (input.trigger === 'handback') {
    notes.push('[Nota interna, não mostre à pessoa: a equipe devolveu esta conversa para você. Responda o que a pessoa perguntou nas últimas mensagens, sem repetir o que a equipe já disse.]');
  }
  const turnText = (parts.join('\n') || notes.join('\n') || 'Olá').slice(0, 2_000);

  // A Flip AI conversation state binds the conversation to the attendant answering it.
  const state = await prisma.flipAiConversationState.upsert({
    where: { conversationId: conversation.id },
    create: { tenantId: input.tenantId, agentId: runtime.id, conversationId: conversation.id, status: 'active' },
    update: {},
  });
  if (state.tenantId !== input.tenantId) return { replied: false, reason: 'state_conflict' };
  if (state.agentId !== runtime.id) {
    await prisma.flipAiConversationState.update({ where: { conversationId: conversation.id }, data: { agentId: runtime.id } });
  }

  // One run per message of the person: the same notice arriving twice never answers twice.
  const requestKey = `instagram:${input.tenantId}:${conversation.id}:${latestInbound.id}`;
  const attemptToken = randomUUID();
  let event;
  try {
    event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: input.tenantId,
        agentId: runtime.id,
        conversationId: conversation.id,
        requestKey,
        operation: 'chat_response',
        provider: plan.provider,
        model: plan.model,
        status: 'processing',
        units: 1,
        metadata: {
          conversationId: conversation.id,
          messageId: latestInbound.id,
          inputHash: digest(turnText),
          knowledgeIndexId: runtime.knowledgeIndexId,
          attemptToken,
          attemptStartedAt: now.toISOString(),
          phase: 'retrieval',
          runtimeVersion: plan.runtimeVersion,
          runtimeProvider: plan.provider,
          runtimeTask: plan.task,
          runtimeModality: plan.modality,
          modelRouting: plan.modelRouting,
          inputMode: 'text',
          humanConversationPolicyVersion: FLIP_AI_HUMAN_CONVERSATION_POLICY_VERSION,
          channel: 'instagram',
          instagramConnectionId: connection.id,
          trigger: input.trigger,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { replied: false, reason: 'duplicate_run' };
    throw error;
  }

  const turn: ExecuteTurn = {
    mode: 'execute',
    tenantId: input.tenantId,
    agentId: runtime.id,
    conversationId: conversation.id,
    requestKey,
    eventId: event.id,
    messageId: latestInbound.id,
    text: turnText,
    inputMode: 'text',
    attemptToken,
    knowledgeIndexId: runtime.knowledgeIndexId,
    outboundExternalId: `ai:instagram:${event.id}`,
    attribution: undefined,
  };

  try {
    const context = await buildPublicChatContext(runtime, turn);
    const aiRepliesSoFar = await prisma.message.count({
      where: { tenantId: input.tenantId, conversationId: conversation.id, direction: 'outbound', sentByUserId: null },
    });
    const raw = await executeFlipAiConversationResponse({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      agentId: runtime.id,
      context: {
        ...context,
        instructions: `${context.instructions}\n\n${instagramInstructions({
          companyName: conversation.tenant.name,
          introduction: whatsappIntroduction(settings.introduction, conversation.tenant.name),
          firstReply: aiRepliesSoFar === 0,
          firstName: clearFirstName(profile.name),
        })}`,
        messages: notes.length && parts.length
          ? [...context.messages, { role: 'user' as const, content: notes.join('\n') }]
          : context.messages,
      },
      textFormat: PUBLIC_CHAT_DECISION_FORMAT,
      timeoutMs: 40_000,
    });
    const parsed = parsePublicChatDecision(raw.text);
    const reply = toInstagramText(parsed.reply);
    if (!reply) throw new OpenAiResponseError('definitive', 'INSTAGRAM_AI_EMPTY_REPLY');

    // A person may have answered (or paused the AI) while it was thinking: then it stays quiet.
    const answeredMeanwhile = await prisma.message.findFirst({
      where: {
        tenantId: input.tenantId, conversationId: conversation.id, direction: 'outbound',
        createdAt: { gt: latestOutbound?.createdAt || new Date(0) },
        ...(latestOutbound ? { id: { not: latestOutbound.id } } : {}),
      },
      select: { id: true },
    });
    const pausedMeanwhile = await prisma.conversation.findFirst({ where: { id: conversation.id }, select: { aiPausedAt: true, aiPauseReason: true } });
    if (answeredMeanwhile || (pausedMeanwhile && isConversationAiPaused(pausedMeanwhile, settings.resumeAfterHours, new Date()))) {
      await failPublicChatTurn(turn, { kind: 'definitive', code: 'INSTAGRAM_AI_TEAM_ANSWERED' }, 'response');
      return { replied: false, reason: 'team_answered_meanwhile' };
    }

    const sent = await enqueueAndDispatchInstagramTextMessage({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      requestedByUserId: '',
      text: reply,
      idempotencyKey: `flipai-${event.id}`,
      aiSender: { agentId: runtime.id, agentName: runtime.name },
    });
    if (sent.status === 'failed') {
      await failPublicChatTurn(turn, { kind: 'definitive', code: 'INSTAGRAM_AI_SEND_FAILED' }, 'response');
      return { replied: false, reason: 'send_failed' };
    }

    await completePublicChatTurn(
      turn,
      { ...raw, text: reply },
      parsed,
      context.evidenceMessageIds,
      context.sources,
      context.memorySnapshot,
      context.availabilitySnapshot,
      context.actionEligibility,
      context.actionPermission,
      { recordOutbound: false },
    );
    return { replied: true, reason: 'sent' };
  } catch (error) {
    const failure = error instanceof OpenAiResponseError || error instanceof FlipAiConversationRuntimeError
      ? error : new OpenAiResponseError('ambiguous', 'INSTAGRAM_AI_RESULT_AMBIGUOUS');
    await failPublicChatTurn(turn, failure, 'response').catch(() => undefined);
    console.error('Instagram AI reply failed', { tenantId: input.tenantId, conversationId: conversation.id, code: failure.code });
    return { replied: false, reason: 'failed' };
  }
}

/** Waits for the person to finish writing, then answers if this is still the latest message. */
export async function replyToInstagramAfterQuietPeriod(input: { tenantId: string; conversationId: string; inboundMessageId: string }) {
  await new Promise((resolve) => setTimeout(resolve, INSTAGRAM_AI_QUIET_SECONDS * 1_000));
  return replyToInstagramConversation({ ...input, trigger: 'message' });
}

/** "Devolver para a IA" in the Inbox: answers the person's last message when it is still unanswered. */
export async function pendingInstagramReply(input: { tenantId: string; conversationId: string }) {
  const latest = await prisma.message.findFirst({
    where: { tenantId: input.tenantId, conversationId: input.conversationId, direction: 'inbound' },
    orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    select: { id: true },
  });
  if (!latest) return { status: 'nothing_pending' as const };
  return {
    status: 'answering' as const,
    run: () => replyToInstagramConversation({ ...input, inboundMessageId: latest.id, trigger: 'handback' }),
  };
}

/**
 * Safety net, called every minute: a message the webhook could not answer (the server stopped
 * before the reply) is answered here. Each conversation goes through the same checks, and one
 * message never gets two answers.
 */
export async function sweepUnansweredInstagramConversations(now = new Date()) {
  const accounts = await prisma.tenantInstagramAiSettings.findMany({
    where: { enabled: true, agentId: { not: null }, connection: { status: 'connected' } },
    select: { tenantId: true },
  });
  let replied = 0;
  for (const tenantId of new Set(accounts.map((account) => account.tenantId))) {
    const candidates = await prisma.conversation.findMany({
      where: {
        tenantId,
        provider: 'meta',
        channel: 'instagram',
        aiPausedAt: null,
        lastInboundAt: { lte: new Date(now.getTime() - 2 * 60_000), gte: new Date(now.getTime() - 30 * 60_000) },
      },
      orderBy: { lastInboundAt: 'asc' },
      take: 20,
      select: { id: true, lastInboundAt: true, lastOutboundAt: true },
    });
    const waiting = candidates
      .filter((candidate) => !candidate.lastOutboundAt || (candidate.lastInboundAt && candidate.lastOutboundAt < candidate.lastInboundAt))
      .slice(0, 5);
    for (const candidate of waiting) {
      const latest = await prisma.message.findFirst({
        where: { tenantId, conversationId: candidate.id, direction: 'inbound' },
        orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: { id: true },
      });
      if (!latest) continue;
      const outcome = await replyToInstagramConversation({
        tenantId, conversationId: candidate.id, inboundMessageId: latest.id, trigger: 'sweep', now,
      }).catch(() => ({ replied: false, reason: 'failed' }));
      if (outcome.replied) replied += 1;
    }
  }
  return { companies: accounts.length, replied };
}
