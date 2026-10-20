import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FLIP_AI_NANO_USD_PER_CREDIT } from '@/lib/flip-ai/usage-billing';
import { monthRange, parseMetaPricing, usdToBrlRate, whatsappMessageCostUsd } from './pricing';

const AI_OPERATION_LABELS: Record<string, string> = {
  chat_response: 'Respostas da IA',
  voice_transcription: 'Áudios transcritos',
  document_check: 'Documentos lidos',
  stage_suggestion: 'Análises de etapa',
};

function creditsToBrl(credits: number, rate: number) {
  return (credits * FLIP_AI_NANO_USD_PER_CREDIT / 1e9) * rate;
}

async function aiCosts(tenantId: string, start: Date, end: Date, rate: number) {
  const rows = await prisma.$queryRaw<Array<{ operation: string; channel: string | null; day: string; credits: bigint | number; events: bigint | number }>>(Prisma.sql`
    SELECT event.operation AS operation,
      event.metadata->>'channel' AS channel,
      to_char(ledger.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
      SUM(ledger.amount_credits) AS credits,
      COUNT(*) AS events
    FROM flip_ai_credit_ledger AS ledger
    JOIN flip_ai_usage_events AS event ON event.id = ledger.reference_id
    WHERE ledger.tenant_id = ${tenantId}
      AND ledger.entry_type = 'debit'
      AND ledger.created_at >= ${start} AND ledger.created_at < ${end}
    GROUP BY 1, 2, 3
  `);
  return rows.map((row) => ({
    operation: row.operation,
    channel: row.channel === 'whatsapp' ? 'whatsapp' : 'web',
    day: row.day,
    brl: creditsToBrl(Number(row.credits), rate),
    events: Number(row.events),
  }));
}

async function whatsappCosts(tenantId: string, start: Date, end: Date, rate: number) {
  const messages = await prisma.message.findMany({
    where: { tenantId, provider: 'meta', channel: 'whatsapp', direction: 'outbound', createdAt: { gte: start, lt: end } },
    select: { metadata: true, createdAt: true },
  });
  const byCategory = new Map<string, { count: number; brl: number }>();
  const byDay = new Map<string, number>();
  let free = 0;
  let unknown = 0;
  for (const message of messages) {
    const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
      ? message.metadata as Record<string, unknown> : {};
    const pricing = parseMetaPricing(metadata.metaPricing);
    if (!pricing) {
      unknown += 1;
      continue;
    }
    if (!pricing.billable) {
      free += 1;
      continue;
    }
    const cost = whatsappMessageCostUsd(pricing) * rate;
    const key = pricing.category || 'outra';
    const current = byCategory.get(key) || { count: 0, brl: 0 };
    byCategory.set(key, { count: current.count + 1, brl: current.brl + cost });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(message.createdAt);
    byDay.set(day, (byDay.get(day) || 0) + cost);
  }
  return { byCategory, byDay, free, unknown, total: [...byCategory.values()].reduce((sum, item) => sum + item.brl, 0) };
}

/** The cost panel of a company for one month: AI and WhatsApp, per result and per day. */
export async function operationCosts(tenantId: string, month: string) {
  const rate = usdToBrlRate();
  const range = monthRange(month);
  const [ai, previousAi, whatsapp, previousWhatsapp, conversations, qualified, closed] = await Promise.all([
    aiCosts(tenantId, range.start, range.end, rate),
    aiCosts(tenantId, range.previousStart, range.start, rate),
    whatsappCosts(tenantId, range.start, range.end, rate),
    whatsappCosts(tenantId, range.previousStart, range.start, rate),
    prisma.flipAiUsageEvent.findMany({
      where: { tenantId, operation: 'chat_response', createdAt: { gte: range.start, lt: range.end }, conversationId: { not: null } },
      select: { conversationId: true },
      distinct: ['conversationId'],
    }),
    prisma.auditLog.count({ where: { tenantId, action: 'lead.whatsapp_ai_created', createdAt: { gte: range.start, lt: range.end } } }),
    // Closed in the month: won leads whose move into their current (final) stage happened in it.
    prisma.leadStageHistory.findMany({
      where: { createdAt: { gte: range.start, lt: range.end }, lead: { tenantId, status: 'won' } },
      select: { leadId: true, toStageId: true, lead: { select: { stageId: true } } },
    }).then((rows) => new Set(rows.filter((row) => row.toStageId === row.lead.stageId).map((row) => row.leadId)).size),
  ]);

  const aiTotal = ai.reduce((sum, row) => sum + row.brl, 0);
  const aiByOperation = new Map<string, { label: string; events: number; brl: number }>();
  for (const row of ai) {
    const key = row.operation;
    const current = aiByOperation.get(key) || { label: AI_OPERATION_LABELS[key] || key, events: 0, brl: 0 };
    aiByOperation.set(key, { ...current, events: current.events + row.events, brl: current.brl + row.brl });
  }
  const days = new Map<string, { ai: number; whatsapp: number }>();
  for (const row of ai) days.set(row.day, { ai: (days.get(row.day)?.ai || 0) + row.brl, whatsapp: days.get(row.day)?.whatsapp || 0 });
  for (const [day, value] of whatsapp.byDay) days.set(day, { ai: days.get(day)?.ai || 0, whatsapp: value });

  const total = aiTotal + whatsapp.total;
  const previousTotal = previousAi.reduce((sum, row) => sum + row.brl, 0) + previousWhatsapp.total;
  const per = (count: number) => (count > 0 ? total / count : null);
  return {
    month: range.label,
    rate,
    total,
    previousTotal,
    ai: {
      total: aiTotal,
      whatsappChannel: ai.filter((row) => row.channel === 'whatsapp').reduce((sum, row) => sum + row.brl, 0),
      siteChannel: ai.filter((row) => row.channel === 'web').reduce((sum, row) => sum + row.brl, 0),
      byOperation: [...aiByOperation.values()].sort((a, b) => b.brl - a.brl),
    },
    whatsapp: {
      total: whatsapp.total,
      byCategory: [...whatsapp.byCategory.entries()].map(([category, value]) => ({ category, ...value })),
      free: whatsapp.free,
      unknown: whatsapp.unknown,
    },
    results: {
      conversations: conversations.length,
      qualifiedLeads: qualified,
      closedClients: closed,
      perConversation: per(conversations.length),
      perQualifiedLead: per(qualified),
      perClosedClient: per(closed),
    },
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, ...value })),
  };
}
