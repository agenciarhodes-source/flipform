import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getFlipAiCreditPackages } from './credit-packages';
import {
  getOpenAiAdminObservability,
  OpenAiAdminObservabilityError,
  parseOpenAiOperationalBalance,
} from './openai-admin-observability';
import {
  buildTreasuryReservePolicy,
  calculateTreasuryCoverage,
  resolveTreasuryBufferPercent,
} from './treasury-policy';

type TenantBalanceRow = {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  balanceCredits: number;
};

type UsageSpendRow = {
  costNanoUsd: bigint | number | string;
  chargedOperations: bigint | number | string;
};

type CompanyUsageRow = {
  tenantId: string;
  tenantName: string;
  accountKind: string;
  confirmedOperations: bigint | number | string;
  chargedOperations: bigint | number | string;
  undebitedOperations: bigint | number | string;
  chargedCredits: bigint | number | string;
  chargedCostNanoUsd: bigint | number | string;
  undebitedCostNanoUsd: bigint | number | string;
};

function number(value: bigint | number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function getFlipAiTreasuryDashboard(now = new Date()) {
  const packages = getFlipAiCreditPackages();
  const bufferPercent = resolveTreasuryBufferPercent(process.env.FLIP_AI_TREASURY_BUFFER_PERCENT);
  const policy = buildTreasuryReservePolicy(packages, bufferPercent);
  const operationalBalance = parseOpenAiOperationalBalance(
    process.env.OPENAI_OPERATIONAL_BALANCE_USD,
  );

  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);

  const [tenantBalances, localUsageRows, sales30d, companyUsageRows] = await Promise.all([
    prisma.$queryRaw<TenantBalanceRow[]>(Prisma.sql`
      SELECT
        a.tenant_id AS "tenantId",
        t.name AS "tenantName",
        t.status::text AS "tenantStatus",
        a.balance_credits AS "balanceCredits"
      FROM flip_ai_credit_accounts a
      INNER JOIN tenants t ON t.id = a.tenant_id
      WHERE a.balance_credits > 0
      ORDER BY a.balance_credits DESC, t.name ASC
    `),
    prisma.$queryRaw<UsageSpendRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN metadata->'billing'->>'costNanoUsd' ~ '^[0-9]+$'
              THEN (metadata->'billing'->>'costNanoUsd')::numeric
            ELSE 0
          END
        ) FILTER (
          WHERE status = 'confirmed'
            AND metadata->'billing'->>'status' = 'charged'
        ), 0) AS "costNanoUsd",
        COUNT(*) FILTER (
          WHERE status = 'confirmed'
            AND metadata->'billing'->>'status' = 'charged'
        ) AS "chargedOperations"
      FROM flip_ai_usage_events
      WHERE created_at >= ${since30d} AND created_at <= ${now}
    `),
    prisma.flipAiTopUpOrder.aggregate({
      where: {
        status: 'credited',
        creditedAt: { gte: since30d, lte: now },
      },
      _sum: {
        amountCents: true,
        credits: true,
        estimatedOpenAiCostCents: true,
      },
      _count: { _all: true },
    }),
    // Consumption is analysed per company (tenant), never per individual login.
    prisma.$queryRaw<CompanyUsageRow[]>(Prisma.sql`
      SELECT
        e.tenant_id AS "tenantId",
        t.name AS "tenantName",
        t.account_kind AS "accountKind",
        COUNT(*) FILTER (WHERE e.status = 'confirmed') AS "confirmedOperations",
        COUNT(*) FILTER (
          WHERE e.status = 'confirmed' AND e.metadata->'billing'->>'status' = 'charged'
        ) AS "chargedOperations",
        COUNT(*) FILTER (
          WHERE e.status = 'confirmed'
            AND e.metadata->'billing'->>'status' IN ('insufficient_balance', 'billing_unavailable', 'failed')
        ) AS "undebitedOperations",
        COALESCE(SUM(
          CASE
            WHEN e.metadata->'billing'->>'amountCredits' ~ '^[0-9]+$'
              THEN (e.metadata->'billing'->>'amountCredits')::numeric
            ELSE 0
          END
        ) FILTER (
          WHERE e.status = 'confirmed' AND e.metadata->'billing'->>'status' = 'charged'
        ), 0) AS "chargedCredits",
        COALESCE(SUM(
          CASE
            WHEN e.metadata->'billing'->>'costNanoUsd' ~ '^[0-9]+$'
              THEN (e.metadata->'billing'->>'costNanoUsd')::numeric
            ELSE 0
          END
        ) FILTER (
          WHERE e.status = 'confirmed' AND e.metadata->'billing'->>'status' = 'charged'
        ), 0) AS "chargedCostNanoUsd",
        COALESCE(SUM(
          CASE
            WHEN e.metadata->'billing'->>'costNanoUsd' ~ '^[0-9]+$'
              THEN (e.metadata->'billing'->>'costNanoUsd')::numeric
            ELSE 0
          END
        ) FILTER (
          WHERE e.status = 'confirmed'
            AND e.metadata->'billing'->>'status' IN ('insufficient_balance', 'billing_unavailable', 'failed')
        ), 0) AS "undebitedCostNanoUsd"
      FROM flip_ai_usage_events e
      INNER JOIN tenants t ON t.id = e.tenant_id
      WHERE e.created_at >= ${since30d} AND e.created_at <= ${now}
      GROUP BY e.tenant_id, t.name, t.account_kind
      HAVING COUNT(*) FILTER (WHERE e.status = 'confirmed') > 0
      ORDER BY "confirmedOperations" DESC, t.name ASC
      LIMIT 100
    `),
  ]);

  const companyUsage30d = companyUsageRows.map((row) => ({
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    // Internal and test accounts still spend real provider money, so they are labelled, not hidden.
    accountKind: row.accountKind,
    confirmedOperations: Math.trunc(number(row.confirmedOperations)),
    chargedOperations: Math.trunc(number(row.chargedOperations)),
    undebitedOperations: Math.trunc(number(row.undebitedOperations)),
    // Confirmed operations with no confirmed cost to bill (e.g. unpriced or partial cost).
    notBillableOperations: Math.max(
      0,
      Math.trunc(number(row.confirmedOperations) - number(row.chargedOperations) - number(row.undebitedOperations)),
    ),
    chargedCredits: Math.trunc(number(row.chargedCredits)),
    chargedCostUsd: roundUsd(number(row.chargedCostNanoUsd) / 1_000_000_000),
    undebitedCostUsd: roundUsd(number(row.undebitedCostNanoUsd) / 1_000_000_000),
  }));

  const creditsInCirculation = tenantBalances.reduce(
    (sum, item) => sum + Math.max(0, item.balanceCredits),
    0,
  );

  const coverage = calculateTreasuryCoverage({
    creditsInCirculation,
    reserveUsdPerMillionCredits: policy.reserveUsdPerMillionCredits,
    bufferPercent,
    operationalBalanceUsd: operationalBalance.status === 'valid'
      ? operationalBalance.usd
      : null,
  });

  const reserveRate = policy.reserveUsdPerMillionCredits;
  const tenants = tenantBalances.map((row) => ({
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    tenantStatus: row.tenantStatus,
    balanceCredits: row.balanceCredits,
    liabilityUsd: reserveRate == null
      ? null
      : roundUsd((row.balanceCredits / 1_000_000) * reserveRate),
  }));

  const localUsageNanoUsd = number(localUsageRows[0]?.costNanoUsd);
  const localUsage30dUsd = roundUsd(localUsageNanoUsd / 1_000_000_000);
  const localAverageDailyUsd = roundUsd(localUsage30dUsd / 30);

  let officialProvider: {
    available: boolean;
    cost30dUsd: number | null;
    averageDailyUsd: number | null;
    errorCode: string | null;
  } = {
    available: false,
    cost30dUsd: null,
    averageDailyUsd: null,
    errorCode: null,
  };

  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  if (adminKey) {
    try {
      const provider = await getOpenAiAdminObservability({
        adminKey,
        organizationId: process.env.OPENAI_ORGANIZATION_ID?.trim() || null,
        operationalBalanceRaw: process.env.OPENAI_OPERATIONAL_BALANCE_USD,
        days: 30,
        now,
      });
      officialProvider = {
        available: true,
        cost30dUsd: provider.costs.totalUsd,
        averageDailyUsd: provider.costs.averageDailyUsd,
        errorCode: null,
      };
    } catch (error) {
      officialProvider = {
        available: false,
        cost30dUsd: null,
        averageDailyUsd: null,
        errorCode: error instanceof OpenAiAdminObservabilityError
          ? error.code
          : 'OPENAI_ADMIN_OBSERVABILITY_FAILED',
      };
    }
  }

  const runwayAverageDailyUsd = officialProvider.averageDailyUsd
    ?? (localAverageDailyUsd > 0 ? localAverageDailyUsd : null);
  const projectedRunwayDays = coverage.operationalBalanceUsd != null
    && runwayAverageDailyUsd != null
    && runwayAverageDailyUsd > 0
    ? Math.round((coverage.operationalBalanceUsd / runwayAverageDailyUsd) * 10) / 10
    : null;

  return {
    generatedAt: now.toISOString(),
    policy,
    balances: {
      tenantsWithCredits: tenants.length,
      creditsInCirculation,
      liabilityUsd: coverage.liabilityUsd,
      requiredReserveUsd: coverage.requiredReserveUsd,
      operationalBalanceUsd: coverage.operationalBalanceUsd,
      operationalBalanceStatus: operationalBalance.status,
      operationalBalanceSource: 'manual_server_configuration' as const,
      coveragePercent: coverage.coveragePercent,
      requiredReserveCoveragePercent: coverage.requiredReserveCoveragePercent,
      recommendedTopUpUsd: coverage.recommendedTopUpUsd,
      status: coverage.status,
    },
    spend: {
      localBilled30dUsd: localUsage30dUsd,
      localChargedOperations30d: Math.trunc(number(localUsageRows[0]?.chargedOperations)),
      localAverageDailyUsd,
      officialProvider,
      projectedRunwayDays,
    },
    sales30d: {
      orders: sales30d._count._all,
      revenueBrl: roundUsd(Number(sales30d._sum.amountCents || 0) / 100),
      creditsSold: Number(sales30d._sum.credits || 0),
      estimatedOpenAiReserveUsd: roundUsd(
        Number(sales30d._sum.estimatedOpenAiCostCents || 0) / 100,
      ),
    },
    tenants: tenants.slice(0, 100),
    companyUsage30d,
    provider: {
      name: 'openai' as const,
      balanceEndpointAvailable: false,
      autoReloadManagedExternally: true,
    },
  };
}
