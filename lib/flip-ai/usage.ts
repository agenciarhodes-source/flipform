import 'server-only';

import { Prisma } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FlipAiError, requireFlipAiAccess } from './access';
import {
  estimateOpenAiUsageCost,
  OPENAI_PRICE_SNAPSHOT,
  OPENAI_PRICE_SOURCE,
  type OpenAiCostCoverage,
} from './openai-pricing';
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
  model: string;
  events: number;
  confirmedEvents: number;
  ambiguousEvents: number;
  processingEvents: number;
  failedEvents: number;
  insufficientBalanceEvents: number;
  billingUnavailableEvents: number;
  inputTokens: number;
  outputTokens: number;
  units: number;
  estimatedCostNanoUsd: number;
  costCoverage: OpenAiCostCoverage;
  costReason: 'realtime_not_reconciled' | 'unknown_model' | null;
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
    insufficientBalanceOperations: number;
    billingUnavailableOperations: number;
    inputTokens: number;
    outputTokens: number;
    realtimeSessions: number;
  };
  pricing: {
    currency: 'USD';
    snapshot: string;
    source: string;
    estimatedCostNanoUsd: number;
    fullyPricedOperations: number;
    partiallyPricedOperations: number;
    unpricedOperations: number;
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
    provider: string;
    model: string;
    status: string;
    inputTokens: number;
    outputTokens: number;
    units: number;
    estimatedCostNanoUsd: number;
    chargedCredits: number;
    billingStatus: string | null;
    priceSnapshot: string | null;
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
  model: string;
  events: bigint | number | string;
  confirmedEvents: bigint | number | string;
  ambiguousEvents: bigint | number | string;
  processingEvents: bigint | number | string;
  failedEvents: bigint | number | string;
  insufficientBalanceEvents: bigint | number | string;
  billingUnavailableEvents: bigint | number | string;
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
  provider: string;
  model: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  units: number;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

type BillingMetadata = {
  status: string | null;
  amountCredits: number;
  costNanoUsd: number;
  priceSnapshot: string | null;
};

function count(value: bigint | number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function labelFlipAiUsageOperation(operation: string) {
  return OPERATION_LABELS[operation] || 'Outra operação';
}

function readBillingMetadata(value: Prisma.JsonValue | null): BillingMetadata | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const billing = (value as Prisma.JsonObject).billing;
  if (!billing || Array.isArray(billing) || typeof billing !== 'object') return null;
  const data = billing as Prisma.JsonObject;
  const amountCredits = typeof data.amountCredits === 'number' && Number.isSafeInteger(data.amountCredits)
    ? Math.max(0, data.amountCredits)
    : 0;
  const costNanoUsd = typeof data.costNanoUsd === 'number' && Number.isSafeInteger(data.costNanoUsd)
    ? Math.max(0, data.costNanoUsd)
    : 0;
  return {
    status: typeof data.status === 'string' ? data.status : null,
    amountCredits,
    costNanoUsd,
    priceSnapshot: typeof data.priceSnapshot === 'string' ? data.priceSnapshot : null,
  };
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

async function buildFlipAiUsageDashboardForTenant(
  tenantId: string,
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
    await ensureUsageSchema(db);

    const [aggregateRows, agentRows, recentRows] = await Promise.all([
      db.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT operation, model,
          COUNT(*) AS events,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS "confirmedEvents",
          COUNT(*) FILTER (WHERE status = 'ambiguous') AS "ambiguousEvents",
          COUNT(*) FILTER (WHERE status = 'processing') AS "processingEvents",
          COUNT(*) FILTER (WHERE status IN ('failed', 'definitive')) AS "failedEvents",
          COUNT(*) FILTER (WHERE status = 'confirmed' AND metadata->'billing'->>'status' = 'insufficient_balance') AS "insufficientBalanceEvents",
          COUNT(*) FILTER (WHERE status = 'confirmed' AND metadata->'billing'->>'status' = 'billing_unavailable') AS "billingUnavailableEvents",
          COALESCE(SUM(input_tokens) FILTER (WHERE status = 'confirmed'), 0) AS "inputTokens",
          COALESCE(SUM(output_tokens) FILTER (WHERE status = 'confirmed'), 0) AS "outputTokens",
          COALESCE(SUM(units) FILTER (WHERE status = 'confirmed'), 0) AS units
        FROM flip_ai_usage_events
        WHERE tenant_id = ${tenantId} AND created_at >= ${range.from} AND created_at < ${range.toExclusive}
        GROUP BY operation, model
        ORDER BY operation, model
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
          AND e.created_at >= ${range.from}
          AND e.created_at < ${range.toExclusive}
          AND e.status = 'confirmed'
        GROUP BY e.agent_id, a.name
        ORDER BY COUNT(*) DESC, a.name ASC NULLS LAST
      `),
      db.$queryRaw<RecentRow[]>(Prisma.sql`
        SELECT e.id, a.name AS "agentName", e.operation, e.provider, e.model, e.status,
          e.input_tokens AS "inputTokens", e.output_tokens AS "outputTokens",
          e.units, e.metadata, e.created_at AS "createdAt"
        FROM flip_ai_usage_events e
        LEFT JOIN flip_ai_agents a
          ON a.id = e.agent_id AND a.tenant_id = e.tenant_id
        WHERE e.tenant_id = ${tenantId} AND e.created_at >= ${range.from}
          AND e.created_at < ${range.toExclusive}
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 50
      `),
    ]);

    const operations = aggregateRows.map((row): FlipAiUsageOperation => {
      const confirmedEvents = count(row.confirmedEvents);
      const inputTokens = count(row.inputTokens);
      const outputTokens = count(row.outputTokens);
      const cost = estimateOpenAiUsageCost({
        operation: row.operation,
        model: row.model,
        confirmedEvents,
        inputTokens,
        outputTokens,
      });
      return {
        operation: row.operation,
        label: labelFlipAiUsageOperation(row.operation),
        model: row.model,
        events: count(row.events),
        confirmedEvents,
        ambiguousEvents: count(row.ambiguousEvents),
        processingEvents: count(row.processingEvents),
        failedEvents: count(row.failedEvents),
        insufficientBalanceEvents: count(row.insufficientBalanceEvents),
        billingUnavailableEvents: count(row.billingUnavailableEvents),
        inputTokens,
        outputTokens,
        units: count(row.units),
        estimatedCostNanoUsd: cost.costNanoUsd,
        costCoverage: cost.coverage,
        costReason: cost.reason,
      };
    });
    const sum = (field: keyof Pick<FlipAiUsageOperation,
      'confirmedEvents' | 'ambiguousEvents' | 'processingEvents' | 'failedEvents' | 'insufficientBalanceEvents' | 'billingUnavailableEvents' | 'inputTokens' | 'outputTokens'>) =>
      operations.reduce((total, operation) => total + operation[field], 0);
    const realtimeSessions = operations
      .filter((operation) => operation.operation === 'realtime_session')
      .reduce((total, operation) => total + operation.confirmedEvents, 0);
    const pricedCount = (coverage: OpenAiCostCoverage) => operations
      .filter((operation) => operation.costCoverage === coverage)
      .reduce((total, operation) => total + operation.confirmedEvents, 0);

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
        insufficientBalanceOperations: sum('insufficientBalanceEvents'),
        billingUnavailableOperations: sum('billingUnavailableEvents'),
        inputTokens: sum('inputTokens'),
        outputTokens: sum('outputTokens'),
        realtimeSessions,
      },
      pricing: {
        currency: 'USD',
        snapshot: OPENAI_PRICE_SNAPSHOT,
        source: OPENAI_PRICE_SOURCE,
        estimatedCostNanoUsd: operations.reduce(
          (total, operation) => total + operation.estimatedCostNanoUsd, 0,
        ),
        fullyPricedOperations: pricedCount('full'),
        partiallyPricedOperations: pricedCount('partial'),
        unpricedOperations: pricedCount('none'),
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
      recent: recentRows.map((row) => {
        const inputTokens = count(row.inputTokens);
        const outputTokens = count(row.outputTokens);
        const billing = readBillingMetadata(row.metadata);
        const estimated = row.status === 'confirmed'
          ? estimateOpenAiUsageCost({
            operation: row.operation,
            model: row.model,
            confirmedEvents: 1,
            inputTokens,
            outputTokens,
          })
          : { costNanoUsd: 0 };
        return {
          id: row.id,
          agentName: row.agentName || 'Operação sem atendente',
          operation: row.operation,
          operationLabel: labelFlipAiUsageOperation(row.operation),
          provider: row.provider,
          model: row.model,
          status: row.status,
          inputTokens,
          outputTokens,
          units: count(row.units),
          estimatedCostNanoUsd: billing?.costNanoUsd ?? estimated.costNanoUsd,
          chargedCredits: billing?.amountCredits ?? 0,
          billingStatus: billing?.status ?? null,
          priceSnapshot: billing?.priceSnapshot ?? null,
          createdAt: row.createdAt.toISOString(),
        };
      }),
      metering: { realtimeAudioReconciled: false },
    };
  });
}


export async function getFlipAiUsageDashboard(
  session: SessionPayload,
  periodOrRange: FlipAiUsagePeriod | FlipAiUsageRange = 30,
  now = new Date(),
): Promise<FlipAiUsageDashboard> {
  const tenantId = await prisma.$transaction(async (db) => {
    const access = await requireFlipAiAccess(db, session);
    return access.tenantId;
  });
  return buildFlipAiUsageDashboardForTenant(tenantId, periodOrRange, now);
}

export async function getFlipAiUsageDashboardForTenant(
  tenantId: string,
  periodOrRange: FlipAiUsagePeriod | FlipAiUsageRange = 30,
  now = new Date(),
): Promise<FlipAiUsageDashboard> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new FlipAiError('TENANT_NOT_FOUND', 404, 'Cliente não encontrado.');
  }
  return buildFlipAiUsageDashboardForTenant(tenant.id, periodOrRange, now);
}
