import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;
export type StageEntry = { leadId: string; stageId: string; enteredAt: Date };

/**
 * Keeps the first time each lead entered each stage (rows must come oldest first). A lead that
 * goes back and forth inside the period still counts once per stage.
 */
export function firstEntries(rows: Array<{ leadId: string; toStageId: string; createdAt: Date }>): StageEntry[] {
  const seen = new Set<string>();
  const entries: StageEntry[] = [];
  for (const row of rows) {
    const key = `${row.leadId}:${row.toStageId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ leadId: row.leadId, stageId: row.toStageId, enteredAt: row.createdAt });
  }
  return entries;
}

/** Distinct leads per stage, from the stage entries. */
export function countByStage(entries: StageEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.stageId, (counts.get(entry.stageId) || 0) + 1);
  return counts;
}

/**
 * Leads that entered one of these stages inside the period, by the day they moved, whatever the
 * day they arrived. The lead filters (pipeline, form, owner) apply; the arrival date does not.
 */
export async function stageEntriesInPeriod(db: Db, input: {
  leadWhere: Prisma.LeadWhereInput;
  stageIds: string[];
  start: Date;
  end: Date;
}) {
  if (!input.stageIds.length) return [] as StageEntry[];
  const rows = await db.leadStageHistory.findMany({
    where: { toStageId: { in: input.stageIds }, createdAt: { gte: input.start, lte: input.end }, lead: input.leadWhere },
    orderBy: { createdAt: 'asc' },
    select: { leadId: true, toStageId: true, createdAt: true },
  });
  return firstEntries(rows as Array<{ leadId: string; toStageId: string; createdAt: Date }>);
}

/**
 * Sales of the period: leads that reached the final stage inside the period and are still closed
 * today, keyed by the day they closed. A lead that arrived months ago and closed this month
 * counts this month.
 */
export async function closedInPeriod(db: Db, input: {
  leadWhere: Prisma.LeadWhereInput;
  finalStageIds: string[];
  start: Date;
  end: Date;
}) {
  const entries = await stageEntriesInPeriod(db, {
    leadWhere: {
      AND: [
        input.leadWhere,
        { status: { not: 'lost' } },
        { OR: [{ stageId: { in: input.finalStageIds } }, { status: 'won' }] },
      ],
    },
    stageIds: input.finalStageIds,
    start: input.start,
    end: input.end,
  });
  const closedAt = new Map<string, Date>();
  for (const entry of entries) if (!closedAt.has(entry.leadId)) closedAt.set(entry.leadId, entry.enteredAt);
  return closedAt;
}

/**
 * The final stage of every active funnel of the company. A lead in it is a sale, whatever its status
 * says (a lead created straight in the final stage used to stay "open").
 */
export async function finalStageIdsForTenant(db: Db, tenantId: string) {
  const stages = await db.pipelineStage.findMany({
    where: { isArchived: false, pipeline: { tenantId, isArchived: false } },
    orderBy: [{ pipelineId: 'asc' }, { orderIndex: 'desc' }],
    select: { id: true, pipelineId: true },
  });
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const stage of stages) {
    if (seen.has(stage.pipelineId)) continue;
    seen.add(stage.pipelineId);
    ids.push(stage.id);
  }
  return ids;
}
