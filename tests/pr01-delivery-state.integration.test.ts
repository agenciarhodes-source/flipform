import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  queueDiagnosticOutboxForCi, leaseDiagnosticOutboxForCi,
  settleDiagnosticOutboxForCi, exhaustExpiredDiagnosticLeaseForCi,
} from '../lib/api-v1/diagnostic-delivery-state';

function disposableOnly(): void {
  if (process.env.CI !== 'true') throw new Error('CI-only diagnostic rehearsal');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/flipform_ci' || url.username !== 'postgres') {
    throw new Error('Requires localhost disposable flipform_ci');
  }
}
const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

test('PR01 Phase 6: atomic leases, stale ack, retries, DLQ, expiry, tenant isolation',
  { skip: process.env.CI !== 'true' },
  async () => {
    disposableOnly();
    const db = new PrismaClient();
    const flag = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true'; // CI process, never Vercel
    const now = new Date('2028-11-19T15:00:00.000Z');
    const suffix = randomUUID().slice(0, 9);
    const tenantIds: string[] = [];
    const makeOutbox = async (tenantId: string, integrationId: string, key: string) => {
      const claim = await db.apiV1IdempotencyRecord.create({
        data: {
          tenantId, integrationId, operation: 'diagnostic.ping',
          keyHash: createHash('sha256').update(key).digest('hex'),
          fingerprint: createHash('sha256').update('fixture').digest('hex'),
        },
      });
      const inbox = await db.apiV1InboxEvent.create({ data: {
        tenantId, integrationId, idempotencyRecordId: claim.id,
        eventType: 'diagnostic.ping',
        payloadHash: createHash('sha256').update('fixture').digest('hex'),
      } });
      return db.apiV1OutboxEvent.create({ data: {
        tenantId, integrationId, inboxEventId: inbox.id,
        eventType: 'diagnostic.ping',
      } });
    };
    try {
      const [a, b] = await Promise.all([
        db.tenant.create({ data: { name: 'CI delivery A', slug: 'pr01-delivery-a-' + suffix } }),
        db.tenant.create({ data: { name: 'CI delivery B', slug: 'pr01-delivery-b-' + suffix } }),
      ]);
      tenantIds.push(a.id, b.id);
      const [ia, ib] = await Promise.all([
        db.apiIntegration.create({ data: {
          tenantId: a.id, displayName: 'A synthetic', status: 'active',
        } }),
        db.apiIntegration.create({ data: {
          tenantId: b.id, displayName: 'B synthetic', status: 'active',
        } }),
      ]);
      const scopeA = { tenantId: a.id, integrationId: ia.id };
      const scopeB = { tenantId: b.id, integrationId: ib.id };
      const [outA, outB, outExpired] = await Promise.all([
        makeOutbox(a.id, ia.id, 'fixture-a-1'),
        makeOutbox(b.id, ib.id, 'fixture-b-1'),
        makeOutbox(a.id, ia.id, 'fixture-a-2'),
      ]);

      assert.equal(await queueDiagnosticOutboxForCi(scopeB, outA.id, db, now), false);
      assert.equal(await queueDiagnosticOutboxForCi(scopeA, outA.id, db, now), true);
      assert.equal(await queueDiagnosticOutboxForCi(scopeA, outA.id, db, now), false);
      assert.equal(await queueDiagnosticOutboxForCi(scopeB, outB.id, db, now), true);
      assert.equal(await queueDiagnosticOutboxForCi(scopeA, outExpired.id, db, now), true);

      const attempts = await Promise.all(Array.from({ length: 12 }, () =>
        leaseDiagnosticOutboxForCi(scopeA, outA.id, db, now)));
      const winners = attempts.filter(x => x.status === 'leased');
      assert.equal(winners.length, 1, 'exactly one worker obtains the row lease');
      const first = winners[0];
      assert.equal(first.status, 'leased');
      if (first.status !== 'leased') throw new Error('missing synthetic lease');
      assert.equal(await db.apiV1DeliveryAttempt.count({ where: {
        tenantId: a.id, outboxEventId: outA.id,
      } }), 1);

      assert.equal((await settleDiagnosticOutboxForCi(scopeB, outA.id, first, 200, db, at(now, 1_000))).status,
        'stale');
      assert.equal((await settleDiagnosticOutboxForCi(scopeA, outA.id,
        { ...first, leaseToken: randomUUID() }, 200, db, at(now, 1_000))).status, 'stale');
      const failure1 = await settleDiagnosticOutboxForCi(
        scopeA, outA.id, first, 503, db, at(now, 1_000));
      assert.equal(failure1.status, 'retry');
      assert.equal(failure1.status === 'retry' && failure1.nextAttemptAt?.getTime(),
        now.getTime() + 31_000);
      assert.equal((await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, at(now, 30_000))).status,
        'not_available');

      const second = await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, at(now, 31_000));
      assert.equal(second.status, 'leased');
      if (second.status !== 'leased') throw new Error('missing retry lease');
      assert.equal((await settleDiagnosticOutboxForCi(scopeA, outA.id, first, 200, db, at(now, 32_000))).status,
        'stale');
      assert.equal((await settleDiagnosticOutboxForCi(
        scopeA, outA.id, second, 429, db, at(now, 32_000))).status, 'retry');

      const third = await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, at(now, 92_000));
      assert.equal(third.status, 'leased');
      if (third.status !== 'leased') throw new Error('missing third lease');
      assert.equal((await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, at(now, 100_000))).status,
        'not_available');
      const fourth = await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, at(now, 153_000));
      assert.equal(fourth.status, 'leased');
      if (fourth.status !== 'leased') throw new Error('missing recovered lease');
      assert.equal(fourth.attemptNo, 4);
      assert.equal((await settleDiagnosticOutboxForCi(
        scopeA, outA.id, third, 200, db, at(now, 154_000))).status, 'stale');
      assert.equal((await settleDiagnosticOutboxForCi(
        scopeA, outA.id, fourth, 503, db, at(now, 154_000))).status, 'retry');

      const fifth = await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, at(now, 394_000));
      assert.equal(fifth.status, 'leased');
      if (fifth.status !== 'leased') throw new Error('missing final lease');
      assert.equal((await settleDiagnosticOutboxForCi(
        scopeA, outA.id, fifth, 503, db, at(now, 395_000))).status, 'dead_letter');
      assert.equal((await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, at(now, 900_000))).status,
        'not_available');
      const stateA = await db.apiV1OutboxEvent.findUnique({ where: { id: outA.id } });
      assert.equal(stateA?.state, 'dead_letter');
      assert.equal(stateA?.attempts, 5);
      assert.equal(stateA?.leaseToken, null);
      assert.deepEqual((await db.apiV1DeliveryAttempt.findMany({
        where: { tenantId: a.id, outboxEventId: outA.id },
        orderBy: { attemptNo: 'asc' },
      })).map(x => x.result), ['retry', 'retry', 'lease_expired', 'retry', 'dead_letter']);

      const bLease = await leaseDiagnosticOutboxForCi(scopeB, outB.id, db, now);
      assert.equal(bLease.status, 'leased');
      if (bLease.status !== 'leased') throw new Error('missing B lease');
      assert.equal((await settleDiagnosticOutboxForCi(scopeB, outB.id,
        bLease, 204, db, at(now, 1_000))).status, 'simulated_success');
      assert.equal((await db.apiV1OutboxEvent.findUnique({ where: { id: outB.id } }))?.state,
        'simulated_success');

      // A fifth-attempt lease that expires is terminally recorded as DLQ.
      let t = at(now, 1_000_000);
      for (let i = 1; i <= 5; i++) {
        const current = await leaseDiagnosticOutboxForCi(scopeA, outExpired.id, db, t);
        assert.equal(current.status, 'leased');
        if (current.status !== 'leased') throw new Error('synthetic lease absent');
        if (i < 5) {
          const outcome = await settleDiagnosticOutboxForCi(
            scopeA, outExpired.id, current, 503, db, at(t, 1_000));
          assert.equal(outcome.status, 'retry');
          if (outcome.status !== 'retry' || !(outcome.nextAttemptAt instanceof Date)) {
            throw new Error('synthetic retry schedule absent');
          }
          t = outcome.nextAttemptAt;
        } else {
          assert.equal(await exhaustExpiredDiagnosticLeaseForCi(scopeA, outExpired.id, db,
            at(t, 60_001)), true);
          assert.equal(await exhaustExpiredDiagnosticLeaseForCi(scopeA, outExpired.id, db,
            at(t, 61_000)), false);
        }
      }
      assert.equal((await db.apiV1OutboxEvent.findUnique({
        where: { id: outExpired.id },
      }))?.state, 'dead_letter');

      process.env.FLIPFORM_API_V1_ENABLED = 'false';
      assert.equal(await queueDiagnosticOutboxForCi(scopeA, outA.id, db, now), false);
      assert.equal((await leaseDiagnosticOutboxForCi(scopeA, outA.id, db, now)).status, 'blocked');
      assert.equal((await settleDiagnosticOutboxForCi(scopeA, outA.id, fifth, 200, db, now)).status,
        'blocked');
      assert.equal(await exhaustExpiredDiagnosticLeaseForCi(scopeA, outA.id, db, now), false);

      // No live sends, actual endpoint, customer payload or cross-tenant ledger.
      assert.equal(await db.apiV1DeliveryAttempt.count({ where: { tenantId: b.id } }), 1);
      assert.equal(await db.apiV1OutboxEvent.count({ where: { tenantId: b.id } }), 1);
    } finally {
      if (tenantIds.length) {
        const where = { tenantId: { in: tenantIds } };
        await db.apiV1DeliveryAttempt.deleteMany({ where });
        await db.apiV1OutboxEvent.deleteMany({ where });
        await db.apiV1InboxEvent.deleteMany({ where });
        await db.apiV1IdempotencyRecord.deleteMany({ where });
        await db.apiIntegration.deleteMany({ where });
        await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      if (flag === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED = flag;
      await db.$disconnect();
    }
  },
);
