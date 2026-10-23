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
import {
  anonymizeText,
  cleanTopic,
  GENERAL_TOPIC,
  LEARNING_KINDS,
  LEARNING_SECTION,
  LEARNING_MAX_SUGGESTIONS,
  parseLearningSuggestions,
  replaceLearningSection,
} from './learning-rules';

const DAY = 86_400_000;
const MANUAL_COOLDOWN_MS = 6 * 3_600_000;
const MAX_SUCCESS = 10;
const MAX_FAILURE = 6;
const MAX_TRANSCRIPT_CHARS = 26_000;

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
          required: ['kind', 'origin', 'topic', 'title', 'content', 'example', 'conversations'],
          properties: {
            kind: { type: 'string', enum: Object.keys(LEARNING_KINDS) },
            origin: { type: 'string', enum: ['human_success', 'human_failure'] },
            topic: { type: 'string' },
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

/** Every Flip AI attendant of the company (the learnings belong to the company, not to one attendant). */
async function companyAgents(tenantId: string) {
  return prisma.flipAiAgent.findMany({
    where: { tenantId, status: { in: ['draft', 'published'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
}

/** The improvements the AI supervision pointed out (low scores) become suggestions too, once each. */
async function importSupervisionLessons(tenantId: string, agentId: string, now: Date) {
  const reviews = await prisma.flipAiConversationReview.findMany({
    where: { tenantId, score: { lte: 2 }, suggestion: { not: null }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { summary: true, suggestion: true },
  });
  let created = 0;
  for (const review of reviews) {
    const content = (review.suggestion || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (content.length < 20) continue;
    const exists = await prisma.attendanceLearningSuggestion.findFirst({ where: { tenantId, origin: 'ai_review', content }, select: { id: true } });
    if (exists) continue;
    await prisma.attendanceLearningSuggestion.create({
      data: {
        id: randomUUID(), tenantId, agentId, kind: 'avoid', origin: 'ai_review', topic: GENERAL_TOPIC,
        title: 'Melhoria apontada pela supervisão da IA', content, example: review.summary.slice(0, 400),
      },
    });
    created += 1;
  }
  return created;
}

async function transcriptOf(tenantId: string, conversation: { id: string; externalContactIdentity: { displayName: string | null }; lead: { name: string } | null }) {
  const messages = await prisma.message.findMany({
    where: { tenantId, conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { direction: true, type: true, text: true, sentByUserId: true, metadata: true },
  });
  const names = [conversation.lead?.name, conversation.externalContactIdentity.displayName];
  return messages.reverse().map((message) => {
    const who = message.direction === 'inbound' ? 'Cliente'
      : typeof metadataOf(message.metadata).aiAgentId === 'string' ? 'IA'
        : message.sentByUserId ? 'Atendente' : 'Sistema';
    return `${who}: ${anonymizeText((message.text || `[${message.type}]`).slice(0, 500), names)}`;
  }).join('\n');
}

/**
 * Reads, without personal data, the WhatsApp conversations of the last 7 days where a person of the
 * team answered: the ones where the lead moved forward or closed (what to repeat) and the ones that
 * stopped or were lost (what to avoid). The AI supervision lessons join the same list. The result is
 * only a list of suggestions; nothing reaches the attendants until an owner approves.
 */
export async function analyzeHumanAttendance(tenantId: string, input: { trigger: 'manual' | 'weekly'; now?: Date }) {
  const now = input.now || new Date();
  if (!process.env.OPENAI_API_KEY?.trim()) return { status: 'unavailable' as const, created: 0 };
  const recent = await prisma.flipAiUsageEvent.findFirst({
    where: { tenantId, operation: 'attendance_learning', createdAt: { gte: new Date(now.getTime() - (input.trigger === 'weekly' ? 6 * DAY : MANUAL_COOLDOWN_MS)) } },
    select: { id: true },
  });
  if (recent) return { status: 'recent' as const, created: 0 };
  const agents = await companyAgents(tenantId);
  if (!agents.length) return { status: 'no_agent' as const, created: 0 };
  const agentId = agents[0].id;
  const fromSupervision = await importSupervisionLessons(tenantId, agentId, now).catch(() => 0);
  const wallet = await getFlipAiCreditBalanceForTenant(tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) return { status: 'no_credits' as const, created: fromSupervision };

  const since = new Date(now.getTime() - 7 * DAY);
  const candidates = await prisma.conversation.findMany({
    where: {
      tenantId, provider: 'meta', channel: 'whatsapp', leadId: { not: null },
      lastMessageAt: { gte: since },
      messages: { some: { direction: 'outbound', sentByUserId: { not: null }, createdAt: { gte: since } } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 60,
    select: {
      id: true, lastMessageAt: true,
      externalContactIdentity: { select: { displayName: true } },
      lead: { select: { name: true, status: true, history: { where: { createdAt: { gte: since }, fromStageId: { not: null } }, select: { id: true }, take: 1 } } },
    },
  });
  const quietSince = new Date(now.getTime() - 3 * DAY);
  const success = candidates.filter((c) => c.lead && c.lead.status !== 'lost' && (c.lead.status === 'won' || c.lead.history.length > 0)).slice(0, MAX_SUCCESS);
  // Did not work: lost, or no step forward and no message for 3 days.
  const failure = candidates.filter((c) => c.lead && (c.lead.status === 'lost'
    || (c.lead.status !== 'won' && c.lead.history.length === 0 && c.lastMessageAt && c.lastMessageAt < quietSince))).slice(0, MAX_FAILURE);
  if (!success.length && !failure.length) {
    return { status: fromSupervision ? 'done' as const : 'nothing_to_learn' as const, created: fromSupervision };
  }

  const blocks: string[] = [];
  let size = 0;
  for (const [label, list] of [['DEU CERTO (o lead avançou ou fechou)', success], ['NÃO DEU CERTO (o lead parou ou foi perdido)', failure]] as const) {
    for (const [index, conversation] of list.entries()) {
      const block = `### ${label} · conversa ${index + 1}\n${await transcriptOf(tenantId, conversation)}`;
      if (size + block.length > MAX_TRANSCRIPT_CHARS) break;
      blocks.push(block);
      size += block.length;
    }
  }

  const known = await prisma.attendanceLearningSuggestion.findMany({
    where: { tenantId, status: { in: ['pending', 'approved'] } },
    orderBy: { createdAt: 'desc' }, take: 80, select: { title: true },
  });
  const model = (await getActiveFlipAiTextModel()).model;
  let parsed: ReturnType<typeof parseLearningSuggestions> = [];
  try {
    const result = await streamOpenAiText({
      instructions: [
        'Você analisa atendimentos de WhatsApp feitos por pessoas da equipe de uma empresa, para ensinar a assistente de IA da própria empresa.',
        'As conversas vêm em dois grupos: "DEU CERTO" e "NÃO DEU CERTO".',
        `Extraia até ${LEARNING_MAX_SUGGESTIONS} lições reaproveitáveis:`,
        '- do grupo DEU CERTO (origin "human_success"): frases que acolheram ou explicaram bem, objeções bem contornadas, perguntas de triagem úteis,',
        '  explicações simples e formas de combinar o próximo passo;',
        '- do grupo NÃO DEU CERTO (origin "human_failure", kind "avoid"): o que provavelmente afastou o cliente e deve ser evitado.',
        'Para cada lição: kind; origin; topic ("Geral" se vale para qualquer atendimento, ou o tema/serviço específico, por exemplo',
        '"Salário-maternidade", "BPC", "Aposentadoria", "Empréstimos"); title (curto); content (orientação pronta para a base de conhecimento,',
        'em português simples, até 500 caracteres); example (trecho curto da conversa, ou null); conversations (em quantas conversas apareceu).',
        'Regras: nunca copie dados pessoais (nomes, telefones, documentos, endereços); nunca proponha promessas de resultado, prazos ou valores;',
        'ignore o que foi dito pela IA; prefira lições que se repetem; não repita estas lições já registradas:',
        ...known.map((row) => `- ${row.title}`),
        'Se não houver nada de valor, devolva uma lista vazia.',
      ].join('\n'),
      messages: [{ role: 'user', content: blocks.join('\n\n') }],
    }, () => undefined, { model, textFormat: LEARNING_FORMAT, timeoutMs: 50_000, maxOutputTokens: 2_000, safetyIdentifier: `learning:${tenantId}` });
    parsed = parseLearningSuggestions(JSON.parse(result.text));
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId,
        requestKey: `attendance-learning:${tenantId}:${now.toISOString()}`,
        operation: 'attendance_learning', provider: 'openai', model: result.model, status: 'confirmed',
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, units: 1,
        metadata: { trigger: input.trigger, success: success.length, failure: failure.length, suggestions: parsed.length } as Prisma.InputJsonValue,
      },
      select: { id: true },
    }).catch(() => null);
    if (event) await settleFlipAiUsageCharge({ tenantId, eventId: event.id }).catch(() => undefined);
  } catch {
    return { status: 'failed' as const, created: fromSupervision };
  }

  for (const item of parsed) {
    await prisma.attendanceLearningSuggestion.create({
      data: {
        id: randomUUID(), tenantId, agentId, kind: item.kind, origin: item.origin, topic: item.topic,
        title: item.title, content: item.content, example: item.example, conversationCount: item.conversations,
      },
    });
  }
  return { status: 'done' as const, created: parsed.length + fromSupervision, conversations: blocks.length };
}

const SUGGESTION_FIELDS = {
  id: true, kind: true, origin: true, topic: true, title: true, content: true, example: true, conversationCount: true,
} as const;

export async function listLearning(tenantId: string) {
  const [pending, approved, lastRun, agents] = await Promise.all([
    prisma.attendanceLearningSuggestion.findMany({ where: { tenantId, status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 60, select: SUGGESTION_FIELDS }),
    prisma.attendanceLearningSuggestion.findMany({ where: { tenantId, status: 'approved' }, orderBy: { decidedAt: 'asc' }, take: 300, select: SUGGESTION_FIELDS }),
    prisma.flipAiUsageEvent.findFirst({ where: { tenantId, operation: 'attendance_learning' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    companyAgents(tenantId),
  ]);
  return { pending, approved, lastRunAt: lastRun?.createdAt || null, agents: agents.map((agent) => agent.name) };
}

export class LearningDecisionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * A Master Markdown saved without the learnings section (for example, a new file pasted over the
 * old one) gets the section back with the company's approved learnings, so they are never lost.
 * Removing a learning is done on the learning page, not by deleting the section.
 */
export async function keepApprovedLearnings(tenantId: string, content: string) {
  if (content.includes(LEARNING_SECTION)) return { content, restored: false };
  const approved = await prisma.attendanceLearningSuggestion.findMany({
    where: { tenantId, status: 'approved' }, orderBy: { decidedAt: 'asc' }, take: 300,
    select: { kind: true, topic: true, title: true, content: true },
  });
  if (!approved.length) return { content, restored: false };
  return { content: replaceLearningSection(content, approved), restored: true };
}

/**
 * Puts the company's approved learnings in the Markdown Mestre of every attendant of the company,
 * as a new revision where something changed. Each attendant still has to process its base.
 */
export async function syncLearningToAgents(session: SessionPayload) {
  if (!session.tenantId) throw new LearningDecisionError(403, 'Selecione uma empresa.');
  const [agents, approved] = await Promise.all([
    companyAgents(session.tenantId),
    prisma.attendanceLearningSuggestion.findMany({
      where: { tenantId: session.tenantId, status: 'approved' }, orderBy: { decidedAt: 'asc' }, take: 300,
      select: { kind: true, topic: true, title: true, content: true },
    }),
  ]);
  const updated: Array<{ name: string; revision: number }> = [];
  const skipped: string[] = [];
  for (const agent of agents) {
    const master = await getMasterMarkdown(session, agent.id).catch(() => null);
    if (!master) { skipped.push(agent.name); continue; }
    const content = replaceLearningSection(master.content, approved);
    if (content === master.content) continue;
    const saved = await saveMasterMarkdown(session, agent.id, { title: master.title, content, expectedRevision: master.revision });
    updated.push({ name: agent.name, revision: saved.revision });
  }
  return { updated, skipped };
}

/**
 * Approve (optionally with the owner's edited text and theme) or dismiss a pending suggestion, or
 * remove an approved one. Approving or removing updates every attendant of the company.
 */
export async function decideLearning(session: SessionPayload, id: string, input: {
  action: 'approve' | 'dismiss' | 'remove'; title?: string; content?: string; topic?: string;
}) {
  if (!session.tenantId) throw new LearningDecisionError(403, 'Selecione uma empresa.');
  const suggestion = await prisma.attendanceLearningSuggestion.findFirst({
    where: { id, tenantId: session.tenantId, status: input.action === 'remove' ? 'approved' : 'pending' },
  });
  if (!suggestion) throw new LearningDecisionError(404, 'Sugestão não encontrada ou já decidida.');
  if (input.action === 'dismiss' || input.action === 'remove') {
    await prisma.attendanceLearningSuggestion.update({ where: { id }, data: { status: 'dismissed', decidedBy: session.userId, decidedAt: new Date() } });
    if (input.action === 'dismiss') return { status: 'dismissed' as const };
    return { status: 'removed' as const, ...(await syncLearningToAgents(session)) };
  }
  const title = (input.title || suggestion.title).replace(/\s+/g, ' ').trim().slice(0, 80);
  const content = (input.content || suggestion.content).replace(/\s+/g, ' ').trim().slice(0, 600);
  if (title.length < 4 || content.length < 20) throw new LearningDecisionError(400, 'Revise o título e o texto da sugestão.');
  await prisma.attendanceLearningSuggestion.update({
    where: { id },
    data: { status: 'approved', title, content, topic: cleanTopic(input.topic ?? suggestion.topic), decidedBy: session.userId, decidedAt: new Date() },
  });
  const sync = await syncLearningToAgents(session);
  if (sync.updated.length) {
    await prisma.attendanceLearningSuggestion.update({ where: { id }, data: { appliedRevision: sync.updated[0].revision } });
  }
  return { status: 'approved' as const, ...sync };
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
