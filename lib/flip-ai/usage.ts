import 'server-only';

import { Prisma } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FlipAiError, requireFlipAiAccess } from './access';
import {
  type FlipAiUsagePeriod,
  type FlipAiUsageRange,
  parseFlipAiUsagePeriod,
  resolveFlipAiUsageRange,
} from './usage-range';

export {
  FLIP_AI_USAGE_PERIODS,
  parseFlipAiUsagePeriod,
} from './usage-range';

export type FlipAiUsageOperation = {
  operation: string;
  label: string;
  events: number;
  confirmedEvents: number;
  ambiguousEvents: number;
  processingEvents: number;
  failedEvents: number;
  inputTokens: number;
  outputTokens: number;
  units: number;
};

export type FlipAiUsageDashboard = {
  periodDays: FlipAiUsagePeriod | null;
  range: {
    kind: FlipAiUsageRange['kind'];
    preset: FlipAiUsageRange['preset'];
    fromDate: string;
    toDate: string;
    label: string;
  };
  since: string;
  until: string;
  generatedAt: string;
  totals: {
    confirmedOperations: number;
    ambiguousOperations: number;
    processingOperations: number;
    failedOperations: number;
    inputTokens: number;
    outputTokens: number;
    realtimeSessions: number;
  };
  operations: FlipAiUsageOperation[];
  agents: Array<{
    agentId: string | null;
    agentName: string;
    confirmedOperations: number;
    inputTokens: number;
    outputTokens: number;
    units: number;
  }>;
  recent: Array<{
    id: string;
    agentName: string;
    operation: string;
    operationLabel: string;
    status: string;
    inputTokens: number;
    outputTokens: number;
    units: number;
    createdAt: string;
  }>;
  metering: {
    realtimeAudioReconciled: false;
  };
};

const OPERATION_LABELS: Record<string, string> = {
  knowledge_embedding: 'Indexação da base',
  knowledge_preview: 'Teste de conhecimento',
  chat_retrieval: 'Busca na base',
  chat_response: 'Conversa por texto',
  web_search: 'Busca externa',
  realtime_session: 'Sessão de voz emitida',
};

type AggregateRow = {
  operation: string;
  events: bigint | number | string;
  confirmedEvents: bigint | number | string;
  ambiguousEvents: bigint | number | string;
  processingEvents: bigint | number | string;
  failedEvents: bigint | number | string;
  inputTokens: bigint | number | string;
  outputTokens: bigint | number | string;
  units: bigint | number | string;
};

type AgentRow = {
  agentId: string | null;
  agentName: string | null;
  confirmedOperations: bigint | number | string;
  inputTokens: bigint | number | string;
  outputTokens: bigint | number | string;
  units: bigint | number | string;
};

type RecentRow = {
  id: string;
  agentName: string | null;
  operation: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  units: number;
  createdAt: Date;
};

function count(value: bigint | number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function labelFlipAiUsageOperation(operation: string) {
  return OPERATION_LABELS[operation] || 'Outra operação';
}

async function ensureUsageSchema(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_usage_events') IS NOT NULL
      AND to_regclass('public.flip_ai_agents') IS NOT NULL AS ready
  `);
  if (!rows[0]?.ready) {
    throw new FlipAiError('FLIP_AI_SCHEMA_NOT_READY', 503,
      'O consumo do Flip AI ainda não está disponível nesta empresa.');
  }
}

export async function getFlipAiUsageDashboard(
  session: SessionPayload,
  periodOrRange: FlipAiUsagePeriod | FlipAiUsageRange = 30,
  now = new Date(),
): Promise<FlipAiUsageDashboard> {
  const range = typeof periodOrRange === 'number'
    ? resolveFlipAiUsageRange({ range: String(parseFlipAiUsagePeriod(periodOrRange)) }, now)
    : periodOrRange;
  const periodDays = range.preset && ['7', '30', '90'].includes(range.preset)
    ? Number(range.preset) as FlipAiUsagePeriod
    : null;

  return prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await ensureUsageSchema(db);

    const [aggregateRows, agentRows, recentRows] = await Promise.all([
      db.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT operation,
          COUNT(*) AS events,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS "confirmedEvents",
          COUNT(*) FILTER (WHERE status = 'ambiguous') AS "ambiguousEvents",
          COUNT(*) FILTER (WHERE status = 'processing') AS "processingEvents",
          COUNT(*) FILTER (WHERE status IN ('failed', 'definitive')) AS "failedEvents",
          COALESCE(SUM(input_tokens) FILTER (WHERE status = 'confirmed'), 0) AS "inputTokens",
          COALESCE(SUM(output_tokens) FILTER (WHERE status = 'confirmed'), 0) AS "outputTokens",
          COALESCE(SUM(units) FILTER (WHERE status = 'confirmed'), 0) AS units
        FROM flip_ai_usage_events
        WHERE tenant_id = ${tenantId} AND created_at >= ${range.from} AND created_at < ${range.toExclusive}
        GROUP BY operation
        ORDER BY operation
      `),
      db.$queryRaw<AgentRow[]>(Prisma.sql`
        SELECT e.agent_id AS "agentId", a.name AS "agentName",
          COUNT(*) AS "confirmedOperations",
          COALESCE(SUM(e.input_tokens), 0) AS "inputTokens",
          COALESCE(SUM(e.output_tokens), 0) AS "outputTokens",
          COALESCE(SUM(e.units), 0) AS units
        FROM flip_ai_usage_events e
        LEFT JOIN flip_ai_agents a
          ON a.id = e.agent_id AND a.tenant_id = e.tenant_id
        WHERE e.tenant_id = ${tenantId}
          AND e.created_at >= ${range.from} AND created_at < ${range.toExclusive}
          AND e.status = 'confirmed'
        GROUP BY e.agent_id, a.name
        ORDER BY COUNT(*) DESC, a.name ASC NULLS LAST
      `),
      db.$queryRaw<RecentRow[]>(Prisma.sql`
        SELECT e.id, a.name AS "agentName", e.operation, e.status,
          e.input_tokens AS "inputTokens", e.output_tokens AS "outputTokens",
          e.units, e.created_at AS "createdAt"
        FROM flip_ai_usage_events e
        LEFT JOIN flip_ai_agents a
          ON a.id = e.agent_id AND a.tenant_id = e.tenant_id
        WHERE e.tenant_id = ${tenantId} AND e.created_at >= ${range.from} AND created_at < ${range.toExclusive}
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 50
      `),
    ]);

    const operations = aggregateRows.map((row): FlipAiUsageOperation => ({
      operation: row.operation,
      label: labelFlipAiUsageOperation(row.operation),
      events: count(row.events),
      confirmedEvents: count(row.confirmedEvents),
      ambiguousEvents: count(row.ambiguousEvents),
      processingEvents: count(row.processingEvents),
      failedEvents: count(row.failedEvents),
      inputTokens: count(row.inputTokens),
      outputTokens: count(row.outputTokens),
      units: count(row.units),
    }));
    const sum = (field: keyof Pick<FlipAiUsageOperation,
      'confirmedEvents' | 'ambiguousEvents' | 'processingEvents' | 'failedEvents' | 'inputTokens' | 'outputTokens'>) =>
      operations.reduce((total, operation) => total + operation[field], 0);
    const realtime = operations.find((operation) => operation.operation === 'realtime_session');

    return {
      periodDays,
      range: {
        kind: range.kind,
        preset: range.preset,
        fromDate: range.fromDate,
        toDate: range.toDate,
        label: range.label,
      },
      since: range.from.toISOString(),
      until: range.toExclusive.toISOString(),
      generatedAt: now.toISOString(),
      totals: {
        confirmedOperations: sum('confirmedEvents'),
        ambiguousOperations: sum('ambiguousEvents'),
        processingOperations: sum('processingEvents'),
        failedOperations: sum('failedEvents'),
        inputTokens: sum('inputTokens'),
        outputTokens: sum('outputTokens'),
        realtimeSessions: realtime?.confirmedEvents || 0,
      },
      operations,
      agents: agentRows.map((row) => ({
        agentId: row.agentId,
        agentName: row.agentName || 'Operação sem atendente',
        confirmedOperations: count(row.confirmedOperations),
        inputTokens: count(row.inputTokens),
        outputTokens: count(row.outputTokens),
        units: count(row.units),
      })),
      recent: recentRows.map((row) => ({
        id: row.id,
        agentName: row.agentName || 'Operação sem atendente',
        operation: row.operation,
        operationLabel: labelFlipAiUsageOperation(row.operation),
        status: row.status,
        inputTokens: count(row.inputTokens),
        outputTokens: count(row.outputTokens),
        units: count(row.units),
        createdAt: row.createdAt.toISOString(),
      })),
      metering: { realtimeAudioReconciled: false },
    };
  });
}
