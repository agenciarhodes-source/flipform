import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { idempotencyScope, requestFingerprint, validIdempotencyKey } from './idempotency';
import type { ApiV1Authorization } from './identity';
import { apiV1Enabled } from './policy';

/**
 * PR01 Phase 4: diagnostic-only, durable Inbox/Outbox prototype.
 * No HTTP handlers, webhook receivers, outbound calls, CRM mutations, or workers
 * invoke this module. A future handler MUST first authenticate the bearer with
 * authorizeApiV1Request and pass ONLY that server-verified identity here.
 */
export type ApiV1DiagnosticEnvelope = { kind: 'diagnostic.ping'; nonce: string };

export type ApiV1EventReceipt =
  | { status: 'created' | 'replayed'; inboxEventId: string; outboxEventId: string }
  | { status: 'conflict' | 'denied' | 'unavailable' };

const OPERATION = 'diagnostic.ping';
const NONCE = /^[A-Za-z0-9_-]{1,64}$/;

function validEnvelope(value: unknown): value is ApiV1DiagnosticEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2
    && record.kind === 'diagnostic.ping'
    && typeof record.nonce === 'string' && NONCE.test(record.nonce);
}

export async function recordApiV1DiagnosticEvent(
  input: {
    authorization: ApiV1Authorization;
    idempotencyKey: string;
    envelope: ApiV1DiagnosticEnvelope;
  },
  db: PrismaClient = prisma,
): Promise<ApiV1EventReceipt> {
  if (!apiV1Enabled(process.env) || !input.authorization.ok
    || input.authorization.scope !== 'events.write'
    || !input.authorization.tenantId || !input.authorization.integrationId
    || !validIdempotencyKey(input.idempotencyKey)
    || !validEnvelope(input.envelope)) return { status: 'denied' };

  // The tenant and integration come exclusively from the verified M2M
  // authorization, never the payload. Only synthetic diagnostic metadata
  // is allowed while there is no authorized customer-data retention policy.
  const tenantId = input.authorization.tenantId;
  const integrationId = input.authorization.integrationId;
  const keyHash = idempotencyScope({
    tenantId, integrationId, operation: OPERATION, key: input.idempotencyKey,
  });
  const fingerprint = requestFingerprint(OPERATION, JSON.stringify([
    input.envelope.kind, input.envelope.nonce,
  ]));
  if (!keyHash || !fingerprint) return { status: 'denied' };

  const scoped = { tenantId, integrationId, operation: OPERATION, keyHash };
  try {
    return await db.$transaction(async (tx) => {
      const integration = await tx.apiIntegration.findFirst({
        where: { id: integrationId, tenantId, status: 'active' },
        select: { id: true },
      });
      if (!integration) return { status: 'denied' } as const;

      // Unique tenant+integration+operation+keyHash is the cross-process lock.
      // All three inserts commit together or roll back; no partial delivery.
      const claim = await tx.apiV1IdempotencyRecord.create({
        data: { ...scoped, fingerprint },
        select: { id: true },
      });
      const inbox = await tx.apiV1InboxEvent.create({
        data: {
          tenantId, integrationId, idempotencyRecordId: claim.id,
          eventType: OPERATION, payloadHash: fingerprint, state: 'held',
        },
        select: { id: true },
      });
      const outbox = await tx.apiV1OutboxEvent.create({
        data: {
          tenantId, integrationId, inboxEventId: inbox.id,
          eventType: OPERATION, state: 'held', attempts: 0,
        },
        select: { id: true },
      });
      return { status: 'created', inboxEventId: inbox.id, outboxEventId: outbox.id } as const;
    });
  } catch (error) {
    if ((error as { code?: string })?.code !== 'P2002') {
      return { status: 'unavailable' }; // no error internals or tenant IDs leaked
    }
    try {
      // PostgreSQL uniqueness waits for the winning transaction to commit.
      // Never retry business effects: read only the original committed receipt.
      const existing = await db.apiV1IdempotencyRecord.findUnique({
        where: { tenantId_integrationId_operation_keyHash: scoped },
        select: {
          fingerprint: true,
          inbox: { select: { id: true, outbox: { select: { id: true } } } },
        },
      });
      if (!existing) return { status: 'unavailable' };
      if (existing.fingerprint !== fingerprint) return { status: 'conflict' };
      if (!existing.inbox?.outbox) return { status: 'unavailable' };
      return {
        status: 'replayed',
        inboxEventId: existing.inbox.id,
        outboxEventId: existing.inbox.outbox.id,
      };
    } catch {
      return { status: 'unavailable' };
    }
  }
}
