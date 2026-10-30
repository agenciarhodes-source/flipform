import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { anonymizeText } from '@/lib/flip/learning-rules';
import { closedInPeriod, finalStageIdsForTenant } from '@/lib/period-activity';
import { attendantSpeed, parseAttendantReview, type AttendantReview, type AttendantSpeed } from './attendance-productivity-rules';

const DAY = 86_400_000;
export const PRODUCTIVITY_PERIODS = [7, 30, 90] as const;
export const REVIEW_OPERATION = 'attendance_review';
const REVIEW_COOLDOWN_MS = 60 * 60_000;
const MAX_MESSAGES = 40_000;
const MAX_CONVERSATIONS_PER_ATTENDANT = 3;
const MAX_TRANSCRIPT_CHARS = 30_000;
/** A customer waiting longer than this, in a conversation of the attendant, counts as "sem resposta". */
const WAITING_MS = 30 * 60_000;

export function periodRange(days: number, now = new Date()) {
  const safe = (PRODUCTIVITY_PERIODS as readonly number[]).includes(days) ? days : 30;
  return { days: safe, from: new Date(now.getTime() - safe * DAY), to: now };
}

function metadataOf(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export type AttendantRow = AttendantSpeed & {
  userId: string;
  name: string;
  waitingNow: number;
  leadsReceived: number;
  leadsAdvanced: number;
  sales: number;
  lost: number;
  conversionPct: number | null;
};

/** The people of the company who attend (viewers do not). */
async function attendants(tenantId: string) {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId, status: 'active', role: { in: ['owner', 'admin', 'manager', 'agent'] } },
    select: { userId: true, user: { select: { name: true } } },
  });
  return new Map(members.map((member) => [member.userId, member.user.name]));
}

/**
 * Speed, volume and results of each person of the team in WhatsApp, for the period.
 * Only this company's data; `onlyUserId` limits the rows to one person (an attendant sees only themself).
 */
export async function attendanceProductivity(tenantId: string, input: { days: number; onlyUserId?: string | null; now?: Date }) {
  const range = periodRange(input.days, input.now);
  const people = await attendants(tenantId);

  // A day before the period too, so a reply on the first day knows when the customer wrote.
  const messages = await prisma.message.findMany({
    where: {
      tenantId, channel: 'whatsapp',
      createdAt: { gte: new Date(range.from.getTime() - DAY), lte: range.to },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_MESSAGES,
    select: { conversationId: true, direction: true, sentByUserId: true, providerTimestamp: true, createdAt: true, metadata: true },
  });
  const speed = attendantSpeed(messages.map((message) => ({
    conversationId: message.conversationId,
    direction: message.direction,
    sentByUserId: message.sentByUserId,
    fromAi: typeof metadataOf(message.metadata).aiAgentId === 'string',
    at: message.providerTimestamp || message.createdAt,
  })), range);

  const waitingRows = await prisma.conversation.findMany({
    where: { tenantId, channel: 'whatsapp', assignedTo: { not: null }, lastInboundAt: { not: null, lte: new Date(range.to.getTime() - WAITING_MS) } },
    select: { assignedTo: true, lastInboundAt: true, lastOutboundAt: true },
  });
  const waiting = new Map<string, number>();
  for (const row of waitingRows) {
    if (!row.assignedTo || !row.lastInboundAt) continue;
    if (row.lastOutboundAt && row.lastOutboundAt >= row.lastInboundAt) continue;
    waiting.set(row.assignedTo, (waiting.get(row.assignedTo) || 0) + 1);
  }

  const finalStageIds = await finalStageIdsForTenant(prisma, tenantId);
  const closed = await closedInPeriod(prisma, { leadWhere: { tenantId }, finalStageIds, start: range.from, end: range.to });
  const [received, advanced, sold, lost] = await Promise.all([
    prisma.lead.groupBy({ by: ['assignedTo'], where: { tenantId, enteredAt: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
    prisma.leadStageHistory.groupBy({
      by: ['changedBy'],
      where: { createdAt: { gte: range.from, lte: range.to }, fromStageId: { not: null }, changedBy: { not: null }, lead: { tenantId } },
      _count: { _all: true },
    }),
    closed.size
      ? prisma.lead.groupBy({ by: ['assignedTo'], where: { id: { in: Array.from(closed.keys()) } }, _count: { _all: true } })
      : Promise.resolve([]),
    prisma.lead.groupBy({ by: ['assignedTo'], where: { tenantId, status: 'lost', updatedAt: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
  ]);
  type Grouped = { assignedTo?: string | null; changedBy?: string | null; _count: { _all: number } };
  const countBy = (rows: unknown, key: 'assignedTo' | 'changedBy') => {
    const counts = new Map<string, number>();
    for (const row of rows as Grouped[]) {
      const id = row[key];
      if (id) counts.set(id, row._count._all);
    }
    return counts;
  };
  const receivedBy = countBy(received, 'assignedTo');
  const advancedBy = countBy(advanced, 'changedBy');
  const soldBy = countBy(sold, 'assignedTo');
  const lostBy = countBy(lost, 'assignedTo');

  const rows: AttendantRow[] = [];
  for (const [userId, name] of people) {
    if (input.onlyUserId && userId !== input.onlyUserId) continue;
    const pace = speed.get(userId);
    const row: AttendantRow = {
      userId, name,
      conversations: pace?.conversations || 0,
      messages: pace?.messages || 0,
      responses: pace?.responses || 0,
      medianResponseMs: pace?.medianResponseMs ?? null,
      averageResponseMs: pace?.averageResponseMs ?? null,
      firstResponseMedianMs: pace?.firstResponseMedianMs ?? null,
      within15MinPct: pace?.within15MinPct ?? null,
      waitingNow: waiting.get(userId) || 0,
      leadsReceived: receivedBy.get(userId) || 0,
      leadsAdvanced: advancedBy.get(userId) || 0,
      sales: soldBy.get(userId) || 0,
      lost: lostBy.get(userId) || 0,
      conversionPct: null,
    };
    row.conversionPct = row.leadsReceived ? Math.round((row.sales / row.leadsReceived) * 100) : null;
    // People who did nothing in the period and have nothing waiting stay out of the list.
    if (row.messages || row.waitingNow || row.leadsReceived || row.leadsAdvanced || row.sales || row.lost) rows.push(row);
  }
  rows.sort((a, b) => b.conversations - a.conversations || b.sales - a.sales);
  return { days: range.days, from: range.from.toISOString(), to: range.to.toISOString(), truncated: messages.length >= MAX_MESSAGES, rows };
}

export type StoredReview = {
  createdAt: string;
  days: number;
  summary: string;
  attendants: AttendantReview[];
};

/** The last evaluation of the approach, kept with the usage record that paid for it. */
export async function latestAttendanceReview(tenantId: string): Promise<StoredReview | null> {
  const event = await prisma.flipAiUsageEvent.findFirst({
    where: { tenantId, operation: REVIEW_OPERATION },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, metadata: true },
  });
  const review = metadataOf(event?.metadata ?? null).review;
  if (!event || !review || typeof review !== 'object') return null;
  const value = review as Record<string, unknown>;
  return {
    createdAt: event.createdAt.toISOString(),
    days: Number(value.days) || 30,
    summary: typeof value.summary === 'string' ? value.summary : '',
    attendants: Array.isArray(value.attendants) ? value.attendants as AttendantReview[] : [],
  };
}

const REVIEW_FORMAT = {
  type: 'json_schema' as const,
  name: 'attendance_review',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'attendants'],
    properties: {
      summary: { type: 'string' },
      attendants: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'score', 'strengths', 'improvements', 'example'],
          properties: {
            key: { type: 'string' },
            score: { type: 'integer' },
            strengths: { type: 'array', items: { type: 'string' } },
            improvements: { type: 'array', items: { type: 'string' } },
            example: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

export async function transcriptFor(tenantId: string, conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { externalContactIdentity: { select: { displayName: true } }, lead: { select: { name: true } } },
  });
  const messages = await prisma.message.findMany({
    where: { tenantId, conversationId },
    orderBy: { createdAt: 'desc' },
    take: 24,
    select: { direction: true, type: true, text: true, sentByUserId: true, metadata: true },
  });
  const names = [conversation?.lead?.name, conversation?.externalContactIdentity.displayName];
  return messages.reverse().map((message) => {
    const who = message.direction === 'inbound' ? 'Cliente'
      : typeof metadataOf(message.metadata).aiAgentId === 'string' ? 'IA'
        : message.sentByUserId === userId ? 'ATENDENTE AVALIADO' : 'Outra pessoa da equipe';
    return `${who}: ${anonymizeText((message.text || `[${message.type}]`).slice(0, 400), names)}`;
  }).join('\n');
}

export class AttendanceReviewError extends Error {
  constructor(readonly code: 'unavailable' | 'recent' | 'no_credits' | 'nothing_to_review' | 'failed') {
    super(code);
    this.name = 'AttendanceReviewError';
  }
}

/**
 * The AI reads, without customer data, a few recent WhatsApp conversations of each person of the
 * team and evaluates the approach: welcome, triage questions, clarity, assertiveness, next step and
 * follow-up. Charged in Flip AI credits; at most once an hour per company.
 */
export async function reviewAttendanceApproach(tenantId: string, input: { days: number; now?: Date }) {
  const now = input.now || new Date();
  if (!process.env.OPENAI_API_KEY?.trim()) throw new AttendanceReviewError('unavailable');
  const recent = await prisma.flipAiUsageEvent.findFirst({
    where: { tenantId, operation: REVIEW_OPERATION, createdAt: { gte: new Date(now.getTime() - REVIEW_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) throw new AttendanceReviewError('recent');
  const wallet = await getFlipAiCreditBalanceForTenant(tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) throw new AttendanceReviewError('no_credits');

  const report = await attendanceProductivity(tenantId, { days: input.days, now });
  const range = periodRange(input.days, now);
  const people = report.rows.filter((row) => row.messages > 0);
  if (!people.length) throw new AttendanceReviewError('nothing_to_review');

  const keys = new Map<string, { userId: string; name: string }>();
  const budget = Math.floor(MAX_TRANSCRIPT_CHARS / people.length);
  const blocks: string[] = [];
  for (const [index, person] of people.entries()) {
    const key = `A${index + 1}`;
    keys.set(key, { userId: person.userId, name: person.name });
    const conversations = await prisma.message.findMany({
      where: { tenantId, channel: 'whatsapp', direction: 'outbound', sentByUserId: person.userId, createdAt: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: 'desc' },
      distinct: ['conversationId'],
      take: MAX_CONVERSATIONS_PER_ATTENDANT,
      select: { conversationId: true },
    });
    const numbers = [
      `conversas: ${person.conversations}`,
      `tempo mediano de resposta: ${person.medianResponseMs === null ? 'sem dado' : `${Math.round(person.medianResponseMs / 60_000)} min`}`,
      `respondidas em até 15 min: ${person.within15MinPct ?? 'sem dado'}%`,
      `clientes esperando agora: ${person.waitingNow}`,
      `vendas: ${person.sales}`, `perdidos: ${person.lost}`,
    ].join(' · ');
    let block = `## ${key}\nNúmeros do período: ${numbers}`;
    for (const conversation of conversations) {
      const transcript = await transcriptFor(tenantId, conversation.conversationId, person.userId);
      if (block.length + transcript.length > budget) break;
      block += `\n### Conversa\n${transcript}`;
    }
    blocks.push(block);
  }

  const model = (await getActiveFlipAiTextModel()).model;
  let parsed: ReturnType<typeof parseAttendantReview>;
  try {
    const result = await streamOpenAiText({
      instructions: [
        'Você é um supervisor de atendimento comercial pelo WhatsApp. Avalie cada pessoa da equipe (A1, A2...) pelas conversas e números enviados.',
        'Avalie: acolhimento e tom; se fez a triagem com as perguntas certas, uma de cada vez, sem presumir fatos; clareza e assertividade;',
        'se respondeu rápido; se contornou objeções; se conduziu ao próximo passo (documentos, reunião, fechamento) e se fez follow-up.',
        'Considere apenas as falas marcadas como "ATENDENTE AVALIADO"; as da IA e de outras pessoas são só contexto.',
        'Para cada pessoa: key; score de 0 a 10; strengths (até 3 pontos fortes, curtos); improvements (até 3 melhorias práticas, com o que',
        'fazer diferente); example (um trecho curto que ilustra uma melhoria, ou null). summary: visão geral da equipe em até 3 frases.',
        'Seja justo e específico, em português simples. Nunca copie dados pessoais de clientes (nomes, telefones, documentos, endereços).',
        'Se uma pessoa tiver poucas mensagens, diga isso nas melhorias e não dê nota alta nem baixa demais.',
      ].join('\n'),
      messages: [{ role: 'user', content: blocks.join('\n\n') }],
    }, () => undefined, { model, textFormat: REVIEW_FORMAT, timeoutMs: 55_000, maxOutputTokens: 2_500, safetyIdentifier: `attendance-review:${tenantId}` });
    parsed = parseAttendantReview(JSON.parse(result.text), keys);
    const review = { days: range.days, summary: parsed.summary, attendants: parsed.attendants };
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId,
        requestKey: `attendance-review:${tenantId}:${now.toISOString()}`,
        operation: REVIEW_OPERATION, provider: 'openai', model: result.model, status: 'confirmed',
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, units: 1,
        metadata: { review } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await settleFlipAiUsageCharge({ tenantId, eventId: event.id }).catch(() => undefined);
  } catch {
    throw new AttendanceReviewError('failed');
  }
  return latestAttendanceReview(tenantId);
}
