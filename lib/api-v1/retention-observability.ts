import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiV1Enabled } from './policy';

/**
 * PR01 Phase 7: CI-only synthetic retention and aggregate observations.
 * No cron, route, worker, telemetry exporter, or production pruning exists.
 * Never return event IDs, credentials, payload digests, nonces or customer data.
 */
export type SyntheticRetentionScope = { tenantId: string; integrationId: string };
export type SyntheticQueueMetrics = {
  outbox: {
    held: number; queued: number; leased: number; retry: number;
    dead_letter: number; simulated_success: number;
  };
  deliveryAttempts: {
    leased: number; retry: number; lease_expired: number;
    lease_expired_dead_letter: number; dead_letter: number; simulated_success: number;
  };
  expiredLeases: number;
  quotaBuckets: number; // read-only; NEVER deleted by this module
  webhookReplays: number;
  purgeEligibleWebhookReplays: number;
};

type Snapshot =
  | { status: 'ok'; metrics: SyntheticQueueMetrics }
  | { status: 'blocked' | 'unavailable' };
type Cleanup =
  | { status: 'dry_run' | 'deleted'; candidates: number; deleted: number }
  | { status: 'blocked' | 'unavailable' | 'limit_exceeded' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RETAIN_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MAX_PURGE_ROWS = 25;
const TEST_INTEGRATION_NAME = 'PR01 Phase7 synthetic';
const TEST_SLUG_PREFIX = 'pr01-retention-';

function ciLocalOnly(): boolean {
  if (process.env.CI !== 'true' || !apiV1Enabled(process.env)) return false;
  try {
    const db = new URL(process.env.DATABASE_URL ?? '');
    return ['postgresql:', 'postgres:'].includes(db.protocol)
      && db.hostname === '127.0.0.1' && db.port === '5432'
      && db.pathname === '/flipform_ci' && db.username === 'postgres';
  } catch { return false; }
}

function validInput(scope: SyntheticRetentionScope, now: Date): boolean {
  return Boolean(scope) && UUID.test(scope.tenantId) && UUID.test(scope.integrationId)
    && now instanceof Date && Number.isFinite(now.getTime())
    && now.getTime() >= RETAIN_AFTER_EXPIRY_MS;
}

async function verifiedSyntheticScope(
  db: PrismaClient, scope: SyntheticRetentionScope,
): Promise<boolean> {
  const integration = await db.apiIntegration.findFirst({
    where: { id: scope.integrationId, tenantId: scope.tenantId },
    select: {
      displayName: true,
      tenant: { select: { slug: true } },
    },
  });
  return integration?.displayName === TEST_INTEGRATION_NAME
    && integration.tenant.slug.startsWith(TEST_SLUG_PREFIX);
}

function expiredBefore(now: Date): Date {
  // A nonce only becomes purge eligible 24h AFTER its verifier expiry.
  // This is a synthetic retention demonstration, not a customer policy.
  return new Date(now.getTime() - RETAIN_AFTER_EXPIRY_MS);
}

function countKnown<K extends string>(
  values: ReadonlyArray<{ name: string; count: number }>, names: readonly K[],
): Record<K, number> {
  const result = Object.fromEntries(names.map(name => [name, 0])) as Record<K, number>;
  for (const row of values) {
    if (Object.prototype.hasOwnProperty.call(result, row.name)) {
      result[row.name as K] += row.count;
    }
  }
  return result;
}

export async function readSyntheticQueueMetricsForCi(
  scope: SyntheticRetentionScope, db: PrismaClient = prisma, now: Date = new Date(),
): Promise<Snapshot> {
  if (!ciLocalOnly() || !validInput(scope, now)) return { status: 'blocked' };
  try {
    if (!await verifiedSyntheticScope(db, scope)) return { status: 'blocked' };
    const where = { tenantId: scope.tenantId, integrationId: scope.integrationId };
    const [outbox, attempts, expiredLeases, quotaBuckets, webhookReplays, purgeEligible] =
      await Promise.all([
        db.apiV1OutboxEvent.groupBy({
          by: ['state'], where, _count: { _all: true },
        }),
        db.apiV1DeliveryAttempt.groupBy({
          by: ['result'], where, _count: { _all: true },
        }),
        db.apiV1OutboxEvent.count({
          where: { ...where, state: 'leased', leaseUntil: { lte: now } },
        }),
        db.apiV1QuotaBucket.count({ where }),
        db.apiV1WebhookReplay.count({ where }),
        db.apiV1WebhookReplay.count({
          where: { ...where, expiresAt: { lte: expiredBefore(now) } },
        }),
      ]);
    return { status: 'ok', metrics: {
      outbox: countKnown(outbox.map(r => ({ name: r.state, count: r._count._all })),
        ['held', 'queued', 'leased', 'retry', 'dead_letter', 'simulated_success'] as const),
      deliveryAttempts: countKnown(attempts.map(r => ({
        name: r.result, count: r._count._all,
      })), ['leased', 'retry', 'lease_expired', 'lease_expired_dead_letter',
        'dead_letter', 'simulated_success'] as const),
      expiredLeases, quotaBuckets, webhookReplays,
      purgeEligibleWebhookReplays: purgeEligible,
    } };
  } catch { return { status: 'unavailable' }; }
}

/**
 * Manual opt-in, tightly bounded synthetic-only demonstration.
 * Dry run is the DEFAULT. The only deletable table is webhook nonce digests.
 * Idempotency, Inbox/Outbox, audit, quota buckets and credentials are NEVER
 * pruned by this function; no auto scheduling or production export exists.
 */
export async function pruneExpiredSyntheticWebhookReplaysForCi(
  scope: SyntheticRetentionScope,
  db: PrismaClient = prisma,
  now: Date = new Date(),
  mode: 'dry_run' | 'apply' = 'dry_run',
): Promise<Cleanup> {
  if (!ciLocalOnly() || !validInput(scope, now)
    || (mode !== 'dry_run' && mode !== 'apply')) return { status: 'blocked' };
  try {
    if (!await verifiedSyntheticScope(db, scope)) return { status: 'blocked' };
    const where = {
      tenantId: scope.tenantId, integrationId: scope.integrationId,
      expiresAt: { lte: expiredBefore(now) },
    };
    // Limit the actual delete to specific reviewed IDs and repeat the filter.
    // No deleteMany without a scoped and bounded ID selection.
    return await db.$transaction(async tx => {
      const candidates = await tx.apiV1WebhookReplay.findMany({
        where, select: { id: true }, orderBy: { id: 'asc' },
        take: MAX_PURGE_ROWS + 1,
      });
      if (candidates.length > MAX_PURGE_ROWS) return { status: 'limit_exceeded' } as const;
      if (mode === 'dry_run') {
        return { status: 'dry_run', candidates: candidates.length, deleted: 0 } as const;
      }
      if (!candidates.length) return { status: 'deleted', candidates: 0, deleted: 0 } as const;
      const result = await tx.apiV1WebhookReplay.deleteMany({
        where: { ...where, id: { in: candidates.map(row => row.id) } },
      });
      return { status: 'deleted', candidates: candidates.length, deleted: result.count } as const;
    });
  } catch { return { status: 'unavailable' }; }
}
