import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { computeFlipAlerts } from './alerts';
import { finalStageIdsForTenant } from '@/lib/period-activity';
import { BRIEFING_FROM_HOUR, brasiliaDayAndHour, briefingInstructions, greetingName, plainBriefing, type BriefingFacts } from './briefing-rules';

type Session = { tenantId: string; userId: string; role: string; name?: string };
const DAY = 86_400_000;

async function collectFacts(session: Session, now: Date): Promise<BriefingFacts> {
  const seesTeam = can(session.role, 'LEADS_VIEW_ALL');
  const own = seesTeam ? {} : { assignedTo: session.userId };
  const { day } = brasiliaDayAndHour(now);
  const todayStart = new Date(`${day}T00:00:00-03:00`);
  const yesterdayStart = new Date(todayStart.getTime() - DAY);

  const finalStageIds = await finalStageIdsForTenant(prisma, session.tenantId);
  const [board, newLeads, aiLeads, closedRows] = await Promise.all([
    computeFlipAlerts(session, now),
    prisma.lead.count({ where: { tenantId: session.tenantId, ...own, createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.auditLog.count({ where: { tenantId: session.tenantId, action: 'lead.whatsapp_ai_created', createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.leadStageHistory.findMany({
      // Sales by the stage: the lead entered the final stage yesterday and is still there.
      where: { createdAt: { gte: yesterdayStart, lt: todayStart }, lead: { tenantId: session.tenantId, status: { not: 'lost' }, stageId: { in: finalStageIds }, ...own } },
      select: { leadId: true, toStageId: true, lead: { select: { stageId: true } } },
    }),
  ]);
  const count = (kind: string) => board.alerts.filter((alert) => alert.kind === kind).length;
  const first = board.alerts.find((alert) => alert.kind !== 'overloaded_attendant') || null;
  const name = greetingName(session.name);
  return {
    seesTeam,
    firstName: name,
    yesterday: {
      newLeads,
      aiLeads: seesTeam ? aiLeads : 0,
      closed: new Set(closedRows.filter((row) => row.toStageId === row.lead.stageId).map((row) => row.leadId)).size,
    },
    today: {
      unanswered: count('unanswered_conversation'),
      overdueTasks: count('overdue_task'),
      hotWithoutTask: count('hot_lead_without_task'),
      newWithoutContact: count('new_lead_without_contact'),
      stale: count('stale_lead'),
      stageSuggestions: count('stage_suggestion'),
      overloaded: board.alerts.filter((alert) => alert.kind === 'overloaded_attendant').map((alert) => ({ name: alert.title, detail: alert.detail })),
    },
    firstPriority: first ? { title: first.title, detail: first.detail } : null,
  };
}

async function writeWithAi(session: Session, facts: BriefingFacts) {
  if (!process.env.OPENAI_API_KEY?.trim()) return null;
  const wallet = await getFlipAiCreditBalanceForTenant(session.tenantId).catch(() => null);
  if (!wallet?.available || wallet.balanceCredits <= 0) return null;
  const model = (await getActiveFlipAiTextModel()).model;
  const result = await streamOpenAiText(
    { instructions: briefingInstructions(facts), messages: [{ role: 'user', content: JSON.stringify(facts) }] },
    () => undefined,
    { model, timeoutMs: 15_000, maxOutputTokens: 400, safetyIdentifier: session.userId },
  ).catch(() => null);
  if (!result?.text.trim()) return null;
  try {
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: session.tenantId,
        requestKey: `flip-briefing:${session.tenantId}:${session.userId}:${result.responseId}`,
        operation: 'flip_briefing',
        provider: 'openai',
        model: result.model,
        status: 'confirmed',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        units: 1,
        metadata: { channel: 'flip' } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await settleFlipAiUsageCharge({ tenantId: session.tenantId, eventId: event.id });
  } catch {
    // The summary is shown even if charging could not be recorded.
  }
  return result.text.trim().slice(0, 1_500);
}

/**
 * Today's summary of the person: made once, the first time they open FlipForm from 7h on, and kept
 * for the rest of the day. Written by the AI from the numbers, or plain when there are no credits.
 */
export async function getTodayBriefing(session: Session, now = new Date()) {
  if (!session.tenantId) return null;
  const { day, hour } = brasiliaDayAndHour(now);
  const existing = await prisma.flipDailyBriefing.findUnique({
    where: { tenantId_userId_day: { tenantId: session.tenantId, userId: session.userId, day } },
  }).catch(() => null);
  if (existing) return existing;
  if (hour < BRIEFING_FROM_HOUR) return null;
  if (!(await isBriefingEnabledForCompany(session.tenantId))) return null;

  const facts = await collectFacts(session, now);
  const aiText = await writeWithAi(session, facts).catch(() => null);
  try {
    return await prisma.flipDailyBriefing.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        day,
        text: aiText || plainBriefing(facts),
        generatedBy: aiText ? 'ai' : 'plain',
      },
    });
  } catch {
    // Two tabs opened at once: the other one already created today's summary.
    return prisma.flipDailyBriefing.findUnique({
      where: { tenantId_userId_day: { tenantId: session.tenantId, userId: session.userId, day } },
    }).catch(() => null);
  }
}

/** Whether the owner left the daily summary on for the company (on by default). */
export async function isBriefingEnabledForCompany(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { flipBriefingEnabled: true } }).catch(() => null);
  return tenant?.flipBriefingEnabled ?? true;
}

export async function markBriefingSeen(session: Session, id: string) {
  await prisma.flipDailyBriefing.updateMany({
    where: { id, tenantId: session.tenantId, userId: session.userId, seenAt: null },
    data: { seenAt: new Date() },
  });
}
