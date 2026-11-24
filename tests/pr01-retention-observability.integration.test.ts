import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  readSyntheticQueueMetricsForCi, pruneExpiredSyntheticWebhookReplaysForCi,
} from '../lib/api-v1/retention-observability';

function assertDisposable(): void {
  if (process.env.CI !== 'true') throw new Error('CI-only fixture');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/flipform_ci' || url.username !== 'postgres') {
    throw new Error('Only ephemeral local flipform_ci is permitted');
  }
}

test('PR01 Phase 7: dry-run, bounded nonce cleanup, isolation, read-only metrics and fail-closed guards',
  { skip: process.env.CI !== 'true' },
  async () => {
    assertDisposable();
    const db = new PrismaClient();
    const oldFlag = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true'; // CI worker only
    const now = new Date('2028-11-19T15:00:00.000Z');
    const suffix = randomUUID().slice(0, 9);
    const tenantIds: string[] = [];
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    try {
      const [a, b, other] = await Promise.all([
        db.tenant.create({ data: { name: 'Synthetic retention A', slug: 'pr01-retention-a-' + suffix } }),
        db.tenant.create({ data: { name: 'Synthetic retention B', slug: 'pr01-retention-b-' + suffix } }),
        db.tenant.create({ data: { name: 'Non-retention tenant', slug: 'pr01-unrelated-' + suffix } }),
      ]);
      tenantIds.push(a.id, b.id, other.id);
      const [ia, ib, ix] = await Promise.all([
        db.apiIntegration.create({ data: {
          tenantId: a.id, displayName: 'PR01 Phase7 synthetic', status: 'active',
        } }),
        db.apiIntegration.create({ data: {
          tenantId: b.id, displayName: 'PR01 Phase7 synthetic', status: 'active',
        } }),
        db.apiIntegration.create({ data: {
          tenantId: other.id, displayName: 'PR01 Phase7 synthetic', status: 'active',
        } }),
      ]);
      const scopeA = { tenantId: a.id, integrationId: ia.id };
      const scopeB = { tenantId: b.id, integrationId: ib.id };
      const scopeOther = { tenantId: other.id, integrationId: ix.id };

      await db.apiV1WebhookReplay.createMany({ data: [
        { ...scopeA, nonceHash: digest('nonce-a-expired'), bodyHash: digest('payload-a'),
          expiresAt: new Date(now.getTime() - 2 * 86_400_000) },
        { ...scopeA, nonceHash: digest('nonce-a-recent'), bodyHash: digest('payload-b'),
          expiresAt: new Date(now.getTime() - 30 * 60_000) },
        { ...scopeB, nonceHash: digest('nonce-b-expired'), bodyHash: digest('payload-c'),
          expiresAt: new Date(now.getTime() - 2 * 86_400_000) },
        { tenantId: other.id, integrationId: ix.id,
          nonceHash: digest('nonce-other'), bodyHash: digest('payload-d'),
          expiresAt: new Date(now.getTime() - 2 * 86_400_000) },
      ] });

      const claim = await db.apiV1IdempotencyRecord.create({ data: {
        ...scopeA, operation: 'diagnostic.ping', keyHash: digest('fixture-key'),
        fingerprint: digest('fixture-payload'),
      } });
      const inbox = await db.apiV1InboxEvent.create({ data: {
        ...scopeA, idempotencyRecordId: claim.id,
        eventType: 'diagnostic.ping', payloadHash: digest('fixture-payload'),
      } });
      const dlq = await db.apiV1OutboxEvent.create({ data: {
        ...scopeA, inboxEventId: inbox.id,
        eventType: 'diagnostic.ping', state: 'dead_letter', attempts: 5,
      } });
      await db.apiV1DeliveryAttempt.create({ data: {
        ...scopeA, outboxEventId: dlq.id, attemptNo: 5,
        result: 'dead_letter', httpStatus: 503, finishedAt: now,
      } });
      const claim2 = await db.apiV1IdempotencyRecord.create({ data: {
        ...scopeA, operation: 'diagnostic.ping', keyHash: digest('other-key'),
        fingerprint: digest('other-payload'),
      } });
      const inbox2 = await db.apiV1InboxEvent.create({ data: {
        ...scopeA, idempotencyRecordId: claim2.id,
        eventType: 'diagnostic.ping', payloadHash: digest('other-payload'),
      } });
      const leased = await db.apiV1OutboxEvent.create({ data: {
        ...scopeA, inboxEventId: inbox2.id, eventType: 'diagnostic.ping',
        state: 'leased', attempts: 1, leaseToken: randomUUID(),
        leaseUntil: new Date(now.getTime() - 10_000),
      } });
      await db.apiV1DeliveryAttempt.create({ data: {
        ...scopeA, outboxEventId: leased.id, attemptNo: 1, result: 'leased',
      } });

      const credential = await db.apiCredential.create({ data: {
        ...scopeA, secretHashHex: digest('fixture-credential'),
        scopes: ['diagnostic.read'],
      } });
      await db.apiV1QuotaBucket.create({ data: {
        ...scopeA, credentialId: credential.id, operation: 'diagnostic.ping',
        windowStart: new Date(now.getTime() - 40 * 86_400_000), consumed: 2,
      } });

      const snapshot = await readSyntheticQueueMetricsForCi(scopeA, db, now);
      assert.equal(snapshot.status, 'ok');
      if (snapshot.status !== 'ok') throw new Error('missing metrics');
      assert.deepEqual(snapshot.metrics.outbox, {
        held: 0, queued: 0, leased: 1, retry: 0,
        dead_letter: 1, simulated_success: 0,
      });
      assert.equal(snapshot.metrics.expiredLeases, 1);
      assert.equal(snapshot.metrics.quotaBuckets, 1);
      assert.equal(snapshot.metrics.webhookReplays, 2);
      assert.equal(snapshot.metrics.purgeEligibleWebhookReplays, 1);
      assert.equal(snapshot.metrics.deliveryAttempts.dead_letter, 1);
      assert.equal(snapshot.metrics.deliveryAttempts.leased, 1);
      assert.equal(JSON.stringify(snapshot).includes(a.id), false);
      assert.equal(JSON.stringify(snapshot).includes(digest('nonce-a-expired')), false);

      assert.deepEqual(await pruneExpiredSyntheticWebhookReplaysForCi(scopeA, db, now), {
        status: 'dry_run', candidates: 1, deleted: 0,
      });
      assert.equal(await db.apiV1WebhookReplay.count({ where: scopeA }), 2);

      assert.deepEqual(await pruneExpiredSyntheticWebhookReplaysForCi(
        scopeOther, db, now, 'apply'), { status: 'blocked' });
      assert.deepEqual(await pruneExpiredSyntheticWebhookReplaysForCi(
        { tenantId: b.id, integrationId: ia.id }, db, now, 'apply'), { status: 'blocked' });

      assert.deepEqual(await pruneExpiredSyntheticWebhookReplaysForCi(scopeA, db, now, 'apply'), {
        status: 'deleted', candidates: 1, deleted: 1,
      });
      assert.equal(await db.apiV1WebhookReplay.count({ where: scopeA }), 1);
      assert.equal(await db.apiV1WebhookReplay.count({ where: scopeB }), 1);
      assert.equal(await db.apiV1WebhookReplay.count({ where: scopeOther }), 1);
      assert.equal(await db.apiV1QuotaBucket.count({ where: scopeA }), 1);
      assert.equal(await db.apiV1DeliveryAttempt.count({ where: scopeA }), 2);
      assert.equal(await db.apiV1IdempotencyRecord.count({ where: scopeA }), 2);
      assert.deepEqual(await pruneExpiredSyntheticWebhookReplaysForCi(scopeA, db, now, 'apply'), {
        status: 'deleted', candidates: 0, deleted: 0,
      });

      process.env.FLIPFORM_API_V1_ENABLED = 'false';
      assert.deepEqual(await readSyntheticQueueMetricsForCi(scopeA, db, now),
        { status: 'blocked' });
      assert.deepEqual(await pruneExpiredSyntheticWebhookReplaysForCi(
        scopeA, db, now, 'apply'), { status: 'blocked' });
      assert.equal(await db.apiV1WebhookReplay.count({ where: scopeA }), 1);
    } finally {
      if (tenantIds.length) {
        const where = { tenantId: { in: tenantIds } };
        await db.apiV1QuotaBucket.deleteMany({ where });
        await db.apiV1DeliveryAttempt.deleteMany({ where });
        await db.apiV1OutboxEvent.deleteMany({ where });
        await db.apiV1InboxEvent.deleteMany({ where });
        await db.apiV1IdempotencyRecord.deleteMany({ where });
        await db.apiV1WebhookReplay.deleteMany({ where });
        await db.apiCredential.deleteMany({ where });
        await db.apiIntegration.deleteMany({ where });
        await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      if (oldFlag === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED = oldFlag;
      await db.$disconnect();
    }
  },
);
