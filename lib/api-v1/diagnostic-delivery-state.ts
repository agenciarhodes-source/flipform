import 'server-only';

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiV1Enabled } from './policy';
import { planWebhookRetry } from './webhook-delivery-policy';
import { diagnosticOutboxFinalizedAt } from './lifecycle-clocks';

/**
 * PR01 Phase 6: synthetic-only state-machine rehearsal. This is NOT a worker.
 * Never calls fetch/DNS/HTTP or reads payloads. A later production worker must
 * have a separate authorization, egress, TLS/IP-pinning and release review.
 * All transitions are refused outside the runner's disposable database.
 */
export type DiagnosticDeliveryScope = { tenantId: string; integrationId: string };
export type DiagnosticLease =
  | { status: 'leased'; leaseToken: string; attemptNo: number }
  | { status: 'not_available' | 'blocked' | 'unavailable' };
export type DiagnosticSettlement =
  | { status: 'simulated_success' | 'retry' | 'dead_letter'; nextAttemptAt?: Date }
  | { status: 'stale' | 'blocked' | 'unavailable' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;

function syntheticOnly(): boolean {
  if (!apiV1Enabled(process.env) || process.env.CI !== 'true') return false;
  try {
    const db = new URL(process.env.DATABASE_URL ?? '');
    return ['postgresql:', 'postgres:'].includes(db.protocol)
      && db.hostname === '127.0.0.1' && db.port === '5432'
      && db.pathname === '/flipform_ci' && db.username === 'postgres';
  } catch {
    return false;
  }
}
function valid(scope: DiagnosticDeliveryScope, eventId: string, now: Date): boolean {
  return Boolean(scope) && UUID.test(scope.tenantId) && UUID.test(scope.integrationId)
    && UUID.test(eventId) && now instanceof Date && Number.isFinite(now.getTime());
}

/** Manual CI-only transition from held to queued; never a production dispatcher. */
export async function queueDiagnosticOutboxForCi(
  scope: DiagnosticDeliveryScope, outboxEventId: string,
  db: PrismaClient = prisma, now: Date = new Date(),
): Promise<boolean> {
  if (!syntheticOnly() || !valid(scope, outboxEventId, now)) return false;
  try {
    const integration = await db.apiIntegration.findFirst({
      where: { id: scope.integrationId, tenantId: scope.tenantId, status: 'active' },
      select: { id: true },
    });
    if (!integration) return false;
    const updated = await db.apiV1OutboxEvent.updateMany({
      where: {
        id: outboxEventId, tenantId: scope.tenantId, integrationId: scope.integrationId,
        eventType: 'diagnostic.ping', state: 'held', attempts: 0,
      },
      data: { state: 'queued', nextAttemptAt: now },
    });
    return updated.count === 1;
  } catch {
    return false;
  }
}

/**
 * Compare-and-set claim in one DB transaction. A UNIQUE attempt number makes
 * an expired lease reclaim auditable; conflicting workers get not_available.
 */
export async function leaseDiagnosticOutboxForCi(
  scope: DiagnosticDeliveryScope, outboxEventId: string,
  db: PrismaClient = prisma, now: Date = new Date(),
): Promise<DiagnosticLease> {
  if (!syntheticOnly() || !valid(scope, outboxEventId, now)) return { status: 'blocked' };
  try {
    return await db.$transaction(async tx => {
      const integration = await tx.apiIntegration.findFirst({
        where: { id: scope.integrationId, tenantId: scope.tenantId, status: 'active' },
        select: { id: true },
      });
      if (!integration) return { status: 'not_available' } as const;
      const old = await tx.apiV1OutboxEvent.findFirst({
        where: {
          id: outboxEventId, ...scope, eventType: 'diagnostic.ping',
        },
        select: {
          attempts: true, state: true, leaseUntil: true, nextAttemptAt: true,
        },
      });
      if (!old || old.attempts >= MAX_ATTEMPTS) return { status: 'not_available' } as const;
      const ready = (['queued', 'retry'].includes(old.state)
        && old.nextAttemptAt !== null && old.nextAttemptAt <= now)
        || (old.state === 'leased' && old.leaseUntil !== null && old.leaseUntil <= now);
      if (!ready) return { status: 'not_available' } as const;
      const token = randomUUID();
      const transition = await tx.apiV1OutboxEvent.updateMany({
        where: {
          id: outboxEventId, ...scope, eventType: 'diagnostic.ping', attempts: old.attempts,
          OR: [
            { state: { in: ['queued', 'retry'] }, nextAttemptAt: { lte: now } },
            { state: 'leased', leaseUntil: { lte: now } },
          ],
        },
        data: {
          state: 'leased', leaseToken: token,
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          nextAttemptAt: null, attempts: { increment: 1 },
        },
      });
      if (transition.count !== 1) return { status: 'not_available' } as const;
      if (old.state === 'leased') {
        const expired = await tx.apiV1DeliveryAttempt.updateMany({
          where: {
            ...scope, outboxEventId, attemptNo: old.attempts, result: 'leased',
          },
          data: { result: 'lease_expired', finishedAt: now },
        });
        if (expired.count !== 1) throw new Error('MISSING_PREVIOUS_ATTEMPT');
      }
      await tx.apiV1DeliveryAttempt.create({
        data: {
          ...scope, outboxEventId, attemptNo: old.attempts + 1, result: 'leased',
        },
      });
      return { status: 'leased', leaseToken: token, attemptNo: old.attempts + 1 } as const;
    });
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Simulated responses only. Stale lease tokens cannot ack or alter a newer
 * attempt. Every transition and its ledger update commit atomically.
 */
export async function settleDiagnosticOutboxForCi(
  scope: DiagnosticDeliveryScope, outboxEventId: string,
  lease: { leaseToken: string; attemptNo: number },
  simulatedHttpStatus: number | null,
  db: PrismaClient = prisma, now: Date = new Date(),
): Promise<DiagnosticSettlement> {
  if (!syntheticOnly() || !valid(scope, outboxEventId, now)
    || !lease || !UUID.test(lease.leaseToken)
    || !Number.isSafeInteger(lease.attemptNo)
    || lease.attemptNo < 1 || lease.attemptNo > MAX_ATTEMPTS
    || (simulatedHttpStatus !== null && (!Number.isInteger(simulatedHttpStatus)
      || simulatedHttpStatus < 100 || simulatedHttpStatus > 599))) return { status: 'blocked' };
  const success = simulatedHttpStatus !== null && simulatedHttpStatus >= 200
    && simulatedHttpStatus < 300;
  const decision = success ? null : planWebhookRetry(lease.attemptNo, simulatedHttpStatus);
  const nextState = success ? 'simulated_success'
    : decision?.action === 'retry' ? 'retry' : 'dead_letter';
  const nextAttemptAt = decision?.action === 'retry'
    ? new Date(now.getTime() + decision.afterMs) : null;
  try {
    return await db.$transaction(async tx => {
      const updated = await tx.apiV1OutboxEvent.updateMany({
        where: {
          id: outboxEventId, ...scope, eventType: 'diagnostic.ping',
          state: 'leased', leaseToken: lease.leaseToken,
          attempts: lease.attemptNo, leaseUntil: { gt: now },
        },
        data: {
          state: nextState, leaseToken: null, leaseUntil: null, nextAttemptAt,
          // Dead-letter/retry remain unresolved, only simulated success is final.
          finalizedAt: diagnosticOutboxFinalizedAt(nextState, now),
        },
      });
      if (updated.count !== 1) return { status: 'stale' } as const;
      const audit = await tx.apiV1DeliveryAttempt.updateMany({
        where: {
          ...scope, outboxEventId, attemptNo: lease.attemptNo, result: 'leased',
        },
        data: { result: nextState, httpStatus: simulatedHttpStatus, finishedAt: now },
      });
      if (audit.count !== 1) throw new Error('MISSING_ATTEMPT_LEDGER');
      return nextState === 'retry'
        ? { status: 'retry', nextAttemptAt: nextAttemptAt! } as const
        : { status: nextState } as { status: 'simulated_success' | 'dead_letter' };
    });
  } catch {
    return { status: 'unavailable' };
  }
}

/** Terminal cleanup for an expired fifth lease; no HTTP send or real worker. */
export async function exhaustExpiredDiagnosticLeaseForCi(
  scope: DiagnosticDeliveryScope, outboxEventId: string,
  db: PrismaClient = prisma, now: Date = new Date(),
): Promise<boolean> {
  if (!syntheticOnly() || !valid(scope, outboxEventId, now)) return false;
  try {
    return await db.$transaction(async tx => {
      const changed = await tx.apiV1OutboxEvent.updateMany({
        where: {
          id: outboxEventId, ...scope, state: 'leased',
          eventType: 'diagnostic.ping', attempts: MAX_ATTEMPTS,
          leaseUntil: { lte: now },
        },
        data: {
          state: 'dead_letter', leaseToken: null,
          leaseUntil: null, nextAttemptAt: null,
        },
      });
      if (changed.count !== 1) return false;
      const audit = await tx.apiV1DeliveryAttempt.updateMany({
        where: {
          ...scope, outboxEventId, attemptNo: MAX_ATTEMPTS, result: 'leased',
        },
        data: { result: 'lease_expired_dead_letter', finishedAt: now },
      });
      if (audit.count !== 1) throw new Error('MISSING_LAST_ATTEMPT');
      return true;
    });
  } catch {
    return false;
  }
}
