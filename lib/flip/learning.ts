import 'server-only';

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { getMasterMarkdown, saveMasterMarkdown } from '@/lib/flip-ai/knowledge';
import { anonymizeText, appendLearningSection, LEARNING_KINDS, LEARNING_MAX_SUGGESTIONS, parseLearningSuggestions } from './learning-rules';

const DAY = 86_400_000;
const MANUAL_COOLDOWN_MS = 6 * 3_600_000;
const MAX_CONVERSATIONS = 12;
const MAX_TRANSCRIPT_CHARS = 24_000;

const LEARNING_FORMAT = {
  type: 'json_schema' as const,
  name: 'attendance_learning',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['suggestions'],
    properties: {
      suggestions: {
        type: 'array',
        maxItems: LEARNING_MAX_SUGGESTIONS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'title', 'content', 'example', 'conversations'],
          properties: {
            kind: { type: 'string', enum: Object.keys(LEARNING_KINDS) },
            title: { type: 'string' },
            content: { type: 'string' },
            example: { type: ['string', 'null'] },
            conversations: { type: 'integer' },
          },
        },
      },
    },
  },
};

function metadataOf(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** The Flip AI agent whose Markdown Mestre receives the learnings: the WhatsApp AI one, or the first published. */
export async function learningAgentId(tenantId: string) {
  const settings = await prisma.tenantWhatsAppAiSettings.findFirst({
    where: { tenantId, agentId: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { agentId: true },
  });
  if (settings?.agentId) return settings.agentId;
  const agent = await prisma.flipAiAgent.findFirst({
    where: { tenantId, status: 'published' }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  return agent?.id || null;
}

/**
 * Reads the WhatsApp conversations of the last 7 days where a person of the team answered and the
 * lead moved forward or closed, without personal data, and asks the AI what worked well. The result
 * is only a list of suggestions: the Markdown Mestre changes only when an owner approves one.
 */
export async function analyzeHumanAttendance(tenantId: string, input: { trigger: 'manual' | 'weekly'; now?: Date }) {
  const now = input.now || new Date();
  if (!process.env.OPENAI_API_KEY?.trim()) return { status: 'unavailable' as const, created: 0 };
  const recent = await prisma.flipAiUsageEvent.findFirst({
    where: { tenantId, operation: 'attendance_learning', createdAt: { gte: new Date(now.getTime() - (input.trigger === 'weekly' ? 6 * DAY : MANUAL_COOLDOWN_MS)) } },
    select: { id: true },
  });
  if (recent) return { status: 'recent' as const, created: 0 };
  const agentId = await learningAgentId(tenantId);
  if (!agentId) return { status: 'no_agent' as const, created: 0 };
  const wallet = await getFlipAiCreditBalanceForTenant(tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) return { status: 'no_credits' as const, created: 0 };

  const since = new Date(now.getTime() - 7 * DAY);
  const candidates = await prisma.conversation.findMany({
    where: {
      tenantId, provider: 'meta', channel: 'whatsapp', leadId: { not: null },
      lastMessageAt: { gte: since },
      messages: { some: { direction: 'outbound', sentByUserId: { not: null }, createdAt: { gte: since } } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 40,
    select: {
      id: true,
      externalContactIdentity: { select: { displayName: true } },
      lead: { select: { name: true, status: true, history: { where: { createdAt: { gte: since }, fromStageId: { not: null } }, select: { id: true }, take: 1 } } },
    },
  });
  const progressed = candidates.filter((conversation) => conversation.lead && (conversation.lead.status === 'won' || conversation.lead.history.length > 0)).slice(0, MAX_CONVERSATIONS);
  if (!progressed.length) return { status: 'nothing_to_learn' as const, created: 0 };

  const transcripts: string[] = [];
  let size = 0;
  for (const [index, conversation] of progressed.entries()) {
    const messages = await prisma.message.findMany({
      where: { tenantId, conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { direction: true, type: true, text: true, sentByUserId: true, metadata: true },
    });
    const names = [conversation.lead?.name, conversation.externalContactIdentity.displayName];
    const lines = messages.reverse().map((message) => {
      const who = message.direction === 'inbound' ? 'Cliente'
        : typeof metadataOf(message.metadata).aiAgentId === 'string' ? 'IA'
          : message.sentByUserId ? 'Atendente' : 'Sistema';
      return `${who}: ${anonymizeText((message.text || `[${message.type}]`).slice(0, 500), names)}`;
    });
    const block = `### Conversa ${index + 1} (${conversation.lead?.status === 'won' ? 'fechou' : 'avançou no funil'})\n${lines.join('\n')}`;
    if (size + block.length > MAX_TRANSCRIPT_CHARS) break;
    transcripts.push(block);
    size += block.length;
  }

  const known = await prisma.attendanceLearningSuggestion.findMany({
    where: { tenantId, status: { in: ['pending', 'approved'] } },
    orderBy: { createdAt: 'desc' }, take: 60, select: { title: true },
  });
  const model = (await getActiveFlipAiTextModel()).model;
  let parsed: ReturnType<typeof parseLearningSuggestions> = [];
  try {
    const result = await streamOpenAiText({
      instructions: [
        'Você analisa atendimentos de WhatsApp feitos por pessoas da equipe que deram certo (o cliente avançou no funil ou fechou).',
        `Extraia até ${LEARNING_MAX_SUGGESTIONS} boas práticas que uma assistente de IA possa reaproveitar: frases que acolheram ou explicaram bem,`,
        'objeções bem contornadas, perguntas de triagem úteis, explicações simples de benefícios e formas de combinar o próximo passo.',
        'Para cada uma: kind; title (curto); content (orientação pronta para a base de conhecimento, em português simples, até 500 caracteres);',
        'example (um trecho curto da conversa que mostre a prática, ou null); conversations (em quantas conversas apareceu).',
        'Regras: nunca copie dados pessoais (nomes, telefones, documentos, endereços); nunca proponha promessas de resultado, prazos ou valores;',
        'ignore o que foi dito pela IA; não repita estas práticas já registradas:',
        ...known.map((row) => `- ${row.title}`),
        'Se não houver nada de valor, devolva uma lista vazia.',
      ].join('\n'),
      messages: [{ role: 'user', content: transcripts.join('\n\n') }],
    }, () => undefined, { model, textFormat: LEARNING_FORMAT, timeoutMs: 45_000, maxOutputTokens: 1_800, safetyIdentifier: `learning:${tenantId}` });
    parsed = parseLearningSuggestions(JSON.parse(result.text));
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId,
        requestKey: `attendance-learning:${tenantId}:${now.toISOString()}`,
        operation: 'attendance_learning', provider: 'openai', model: result.model, status: 'confirmed',
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, units: 1,
        metadata: { trigger: input.trigger, conversations: transcripts.length, suggestions: parsed.length } as Prisma.InputJsonValue,
      },
      select: { id: true },
    }).catch(() => null);
    if (event) await settleFlipAiUsageCharge({ tenantId, eventId: event.id }).catch(() => undefined);
  } catch {
    return { status: 'failed' as const, created: 0 };
  }

  for (const item of parsed) {
    await prisma.attendanceLearningSuggestion.create({
      data: {
        id: randomUUID(), tenantId, agentId, kind: item.kind, title: item.title, content: item.content,
        example: item.example, conversationCount: item.conversations,
      },
    });
  }
  return { status: 'done' as const, created: parsed.length, conversations: transcripts.length };
}

export async function listLearning(tenantId: string) {
  const [pending, approved, lastRun] = await Promise.all([
    prisma.attendanceLearningSuggestion.findMany({
      where: { tenantId, status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, kind: true, title: true, content: true, example: true, conversationCount: true, createdAt: true },
    }),
    prisma.attendanceLearningSuggestion.count({ where: { tenantId, status: 'approved' } }),
    prisma.flipAiUsageEvent.findFirst({
      where: { tenantId, operation: 'attendance_learning' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true },
    }),
  ]);
  return { pending, approvedCount: approved, lastRunAt: lastRun?.createdAt || null };
}

export class LearningDecisionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Approve (optionally with the owner's edited text) adds the learning to the Markdown Mestre as a
 * new revision; the base still has to be processed. Dismiss only closes it.
 */
export async function decideLearning(session: SessionPayload, id: string, input: { action: 'approve' | 'dismiss'; title?: string; content?: string }) {
  if (!session.tenantId) throw new LearningDecisionError(403, 'Selecione uma empresa.');
  const suggestion = await prisma.attendanceLearningSuggestion.findFirst({ where: { id, tenantId: session.tenantId, status: 'pending' } });
  if (!suggestion) throw new LearningDecisionError(404, 'Sugestão não encontrada ou já decidida.');
  if (input.action === 'dismiss') {
    await prisma.attendanceLearningSuggestion.update({ where: { id }, data: { status: 'dismissed', decidedBy: session.userId, decidedAt: new Date() } });
    return { status: 'dismissed' as const };
  }
  const title = (input.title || suggestion.title).replace(/\s+/g, ' ').trim().slice(0, 80);
  const content = (input.content || suggestion.content).replace(/\s+/g, ' ').trim().slice(0, 600);
  if (title.length < 4 || content.length < 20) throw new LearningDecisionError(400, 'Revise o título e o texto da sugestão.');
  const master = await getMasterMarkdown(session, suggestion.agentId);
  if (!master) throw new LearningDecisionError(409, 'O atendente ainda não tem Markdown Mestre.');
  const saved = await saveMasterMarkdown(session, suggestion.agentId, {
    title: master.title,
    content: appendLearningSection(master.content, { title, content }),
    expectedRevision: master.revision,
  });
  await prisma.attendanceLearningSuggestion.update({
    where: { id },
    data: { status: 'approved', title, content, decidedBy: session.userId, decidedAt: new Date(), appliedRevision: saved.revision },
  });
  return { status: 'approved' as const, revision: saved.revision };
}

/** Weekly run for every company with the WhatsApp AI on (a few per call; the next call takes the rest). */
export async function runWeeklyAttendanceLearning(now = new Date()) {
  const tenants = await prisma.tenantWhatsAppAiSettings.findMany({ where: { enabled: true }, select: { tenantId: true }, distinct: ['tenantId'] });
  let analyzed = 0;
  for (const { tenantId } of tenants) {
    if (analyzed >= 2) break;
    const result = await analyzeHumanAttendance(tenantId, { trigger: 'weekly', now }).catch(() => null);
    if (result && result.status !== 'recent') analyzed += 1;
  }
  return { tenants: tenants.length, analyzed };
}
