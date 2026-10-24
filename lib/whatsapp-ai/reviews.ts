import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { optOutPhone } from '@/lib/post-sale/runner';
import {
  DAILY_REVIEWS_PER_RUN,
  inDailyReviewWindow,
  parseIssues,
  readyForReview,
  REVIEW_ISSUES,
  REVIEWS_PER_OPEN,
  weeklySummary,
} from './review-rules';

const DAY = 86_400_000;

const REVIEW_FORMAT = {
  type: 'json_schema' as const,
  name: 'flip_ai_conversation_review',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['score', 'issues', 'summary', 'suggestion'],
    properties: {
      score: { type: 'integer', minimum: 1, maximum: 5 },
      issues: { type: 'array', items: { type: 'string', enum: Object.keys(REVIEW_ISSUES) } },
      summary: { type: 'string' },
      suggestion: { type: ['string', 'null'] },
    },
  },
};

function metadataOf(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Reviews, when someone opens the supervision page, up to 10 conversations the AI took part in
 * that stopped. The verdict stays with the conversation; nothing in the conversation changes.
 */
export async function reviewPendingConversations(
  tenantId: string,
  now = new Date(),
  options: { limit?: number; deadline?: number } = {},
) {
  const limit = options.limit ?? REVIEWS_PER_OPEN;
  if (!process.env.OPENAI_API_KEY?.trim()) return { reviewed: 0 };
  const wallet = await getFlipAiCreditBalanceForTenant(tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) return { reviewed: 0 };

  const conversations = await prisma.conversation.findMany({
    where: {
      tenantId, provider: 'meta', channel: 'whatsapp',
      flipAiState: { isNot: null },
      lastMessageAt: { gte: new Date(now.getTime() - 30 * DAY) },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 60,
    select: {
      id: true, lastMessageAt: true, aiPausedAt: true,
      externalContactIdentity: { select: { externalUserId: true } },
    },
  });
  const optOuts = new Set((await prisma.contactOptOut.findMany({ where: { tenantId }, select: { phone: true } })).map((row) => row.phone));
  const model = (await getActiveFlipAiTextModel()).model;
  let reviewed = 0;

  for (const conversation of conversations) {
    if (reviewed >= limit) break;
    if (options.deadline && Date.now() > options.deadline) break;
    const messages = await prisma.message.findMany({
      where: { tenantId, conversationId: conversation.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 40,
      select: { id: true, direction: true, type: true, text: true, sentByUserId: true, metadata: true },
    });
    if (!messages.length) continue;
    const last = messages[0];
    const aiReplied = messages.some((message) => typeof metadataOf(message.metadata).aiAgentId === 'string');
    const done = await prisma.flipAiConversationReview.findUnique({
      where: { conversationId_lastMessageId: { conversationId: conversation.id, lastMessageId: last.id } },
      select: { id: true },
    });
    if (!readyForReview({
      aiReplied,
      lastMessageAt: conversation.lastMessageAt,
      paused: Boolean(conversation.aiPausedAt),
      optedOut: optOuts.has(optOutPhone(conversation.externalContactIdentity.externalUserId)),
      alreadyReviewedLastMessage: Boolean(done),
      now,
    })) continue;

    const transcript = messages.reverse().map((message) => {
      const who = message.direction === 'inbound' ? 'Cliente'
        : typeof metadataOf(message.metadata).aiAgentId === 'string' ? 'IA'
          : message.sentByUserId ? 'Equipe' : 'Sistema';
      const body = message.text?.trim() || `[${message.type}]`;
      return `${who}: ${body.slice(0, 700)}`;
    }).join('\n');

    let verdict: { score: number; issues: unknown; summary: string; suggestion: string | null } | null = null;
    try {
      const result = await streamOpenAiText({
        instructions: [
          'Você supervisiona o atendimento de uma IA no WhatsApp de uma empresa. Avalie só as falas marcadas "IA".',
          'Dê uma nota de 1 (ruim) a 5 (excelente) e marque os problemas que realmente aconteceram:',
          ...Object.entries(REVIEW_ISSUES).map(([key, label]) => `- ${key}: ${label}`),
          'summary: 1 ou 2 frases sobre o que aconteceu. suggestion: uma melhoria concreta para a base de conhecimento ou o comportamento da IA, ou null.',
          'Não copie dados pessoais (nome completo, documentos, telefone) para a resposta.',
        ].join('\n'),
        messages: [{ role: 'user', content: transcript }],
      }, () => undefined, { model, textFormat: REVIEW_FORMAT, timeoutMs: 25_000, maxOutputTokens: 400, safetyIdentifier: conversation.id });
      verdict = JSON.parse(result.text);
      const event = await prisma.flipAiUsageEvent.create({
        data: {
          tenantId, conversationId: conversation.id,
          requestKey: `ai-review:${conversation.id}:${last.id}`,
          operation: 'ai_review', provider: 'openai', model: result.model, status: 'confirmed',
          inputTokens: result.inputTokens, outputTokens: result.outputTokens, units: 1,
          metadata: { channel: 'whatsapp' } as Prisma.InputJsonValue,
        },
        select: { id: true },
      }).catch(() => null);
      if (event) await settleFlipAiUsageCharge({ tenantId, eventId: event.id }).catch(() => undefined);
    } catch {
      verdict = null;
    }
    if (!verdict) continue;
    await prisma.flipAiConversationReview.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        lastMessageId: last.id,
        score: Math.max(1, Math.min(5, Math.round(Number(verdict.score) || 3))),
        issues: parseIssues(verdict.issues),
        summary: String(verdict.summary || '').slice(0, 600),
        suggestion: verdict.suggestion ? String(verdict.suggestion).slice(0, 800) : null,
      },
    }).catch(() => undefined);
    reviewed += 1;
  }
  return { reviewed };
}

/**
 * Daily review, without anyone opening the page: every morning (6:00 to 7:59, Brasília) the
 * scheduler reviews, a few at a time, the AI conversations of every company with the AI on.
 * Conversations already reviewed are skipped, so each one is paid for once.
 */
export async function sweepDailyAiReviews(now = new Date()) {
  if (!inDailyReviewWindow(now)) return { tenants: 0, reviewed: 0 };
  const deadline = Date.now() + 20_000;
  const tenants = await prisma.tenantWhatsAppAiSettings.findMany({
    where: { enabled: true, agentId: { not: null } },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });
  let reviewed = 0;
  for (const { tenantId } of tenants) {
    if (Date.now() > deadline) break;
    const result = await reviewPendingConversations(tenantId, now, { limit: DAILY_REVIEWS_PER_RUN, deadline })
      .catch(() => ({ reviewed: 0 }));
    reviewed += result.reviewed;
  }
  return { tenants: tenants.length, reviewed };
}

export async function supervisionView(tenantId: string, now = new Date()) {
  const [reviews, week] = await Promise.all([
    prisma.flipAiConversationReview.findMany({
      where: { tenantId, status: 'new' },
      orderBy: [{ score: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true, conversationId: true, score: true, issues: true, summary: true, suggestion: true, createdAt: true,
        conversation: { select: { lead: { select: { name: true } }, externalContactIdentity: { select: { displayName: true, phone: true } } } },
      },
    }),
    prisma.flipAiConversationReview.findMany({
      where: { tenantId, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
      select: { score: true, issues: true },
    }),
  ]);
  return {
    week: weeklySummary(week.map((review) => ({ score: review.score, issues: parseIssues(review.issues) }))),
    reviews: reviews.map((review) => ({
      id: review.id,
      conversationId: review.conversationId,
      contact: review.conversation.lead?.name || review.conversation.externalContactIdentity.displayName || review.conversation.externalContactIdentity.phone || 'Contato',
      score: review.score,
      issues: parseIssues(review.issues),
      summary: review.summary,
      suggestion: review.suggestion,
      createdAt: review.createdAt.toISOString(),
    })),
  };
}
