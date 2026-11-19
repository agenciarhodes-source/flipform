import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { digestApiV1Secret, authorizeApiV1Request, type ApiV1Authorization } from '../lib/api-v1/identity';
import { PrismaApiV1CredentialRepository } from '../lib/api-v1/prisma-credential-repository';
import { recordApiV1DiagnosticEvent } from '../lib/api-v1/durable-events';

function assertIsolatedDb(): void {
  if (process.env.CI !== 'true') throw new Error('PR01 durable-event test is CI-only');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/flipform_ci' || url.username !== 'postgres') {
    throw new Error('PR01 event tests require the isolated disposable database');
  }
}

test('PR01 durable claims: concurrent replay, conflict, tenant FK and held outbox are isolated',
  { skip: process.env.CI !== 'true' },
  async () => {
    assertIsolatedDb();
    const db = new PrismaClient();
    const oldFlag = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true'; // CI runner only
    const suffix = randomUUID().slice(0, 8);
    const tenantIds: string[] = [];
    let planId = '';
    let createdPlan = false;
    try {
      let plan = await db.plan.findUnique({ where: { slug: 'premium' } });
      if (!plan) {
        plan = await db.plan.create({ data: {
          slug: 'premium', name: 'Synthetic Premium', price: 997, isActive: true,
        } });
        createdPlan = true;
      }
      planId = plan.id;
      const a = await db.tenant.create({ data: { name: 'Synthetic tenant A', slug: 'event-a-' + suffix } });
      const b = await db.tenant.create({ data: { name: 'Synthetic tenant B', slug: 'event-b-' + suffix } });
      tenantIds.push(a.id, b.id);
      await db.subscription.createMany({ data: tenantIds.map(tenantId => ({
        tenantId, planId, status: 'active', provider: 'synthetic-pr01-events',
      })) });
      const integrationA = await db.apiIntegration.create({ data: {
        tenantId: a.id, displayName: 'A diagnostic', status: 'active',
      } });
      const integrationB = await db.apiIntegration.create({ data: {
        tenantId: b.id, displayName: 'B diagnostic', status: 'active',
      } });
      const secretA = Buffer.alloc(32, 19);
      const secretB = Buffer.alloc(32, 23);
      const credA = await db.apiCredential.create({ data: {
        tenantId: a.id, integrationId: integrationA.id,
        secretHashHex: digestApiV1Secret(secretA), scopes: ['events.write'],
        expiresAt: new Date('2031-01-01T00:00:00Z'),
      } });
      const credB = await db.apiCredential.create({ data: {
        tenantId: b.id, integrationId: integrationB.id,
        secretHashHex: digestApiV1Secret(secretB), scopes: ['events.write'],
        expiresAt: new Date('2031-01-01T00:00:00Z'),
      } });
      const repo = new PrismaApiV1CredentialRepository(db, {
        limit: 100, windowMs: 60_000, now: () => new Date('2028-06-01T12:00:00Z'),
      });
      const authorize = async (id: string, secret: Buffer): Promise<ApiV1Authorization> =>
        authorizeApiV1Request({
          authorizationHeader: 'Bearer ffv1.' + id + '.' + secret.toString('base64url'),
          scope: 'events.write', operation: 'diagnostic.ping',
          now: new Date('2028-06-01T12:00:00Z'),
        }, repo);
      const contexts = await Promise.all(Array.from({ length: 8 }, () =>
        authorize(credA.id, secretA)));
      assert.equal(contexts.filter(x => x.ok).length, 8);

      const key = ['fixture', 'repeat', '001'].join('-');
      const envelope = { kind: 'diagnostic.ping' as const, nonce: 'fixture_a' };
      const results = await Promise.all(contexts.map(authorization =>
        recordApiV1DiagnosticEvent({ authorization, idempotencyKey: key, envelope }, db)));
      assert.equal(results.filter(x => x.status === 'created').length, 1, 'exactly one insert');
      assert.equal(results.filter(x => x.status === 'replayed').length, 7, 'seven replays');
      const receipts = results.filter((x): x is Extract<typeof x, { status: 'created' | 'replayed' }> =>
        x.status === 'created' || x.status === 'replayed');
      assert.equal(new Set(receipts.map(x => x.inboxEventId)).size, 1);
      assert.equal(new Set(receipts.map(x => x.outboxEventId)).size, 1);
      assert.equal(await db.apiV1IdempotencyRecord.count({ where: { tenantId: a.id } }), 1);
      assert.equal(await db.apiV1InboxEvent.count({ where: { tenantId: a.id } }), 1);
      assert.equal(await db.apiV1OutboxEvent.count({ where: { tenantId: a.id } }), 1);

      const contextA = await authorize(credA.id, secretA);
      assert.equal((await recordApiV1DiagnosticEvent({
        authorization: contextA, idempotencyKey: key,
        envelope: { kind: 'diagnostic.ping', nonce: 'different' },
      }, db)).status, 'conflict');
      assert.equal(await db.apiV1OutboxEvent.count({ where: { tenantId: a.id } }), 1);

      // The same client-supplied key is independent for tenant B.
      const contextB = await authorize(credB.id, secretB);
      const resultB = await recordApiV1DiagnosticEvent({
        authorization: contextB, idempotencyKey: key, envelope,
      }, db);
      assert.equal(resultB.status, 'created');
      assert.equal(await db.apiV1InboxEvent.count({ where: { tenantId: b.id } }), 1);
      assert.equal(await db.apiV1OutboxEvent.count({ where: { tenantId: b.id } }), 1);

      // Composite FKs make a cross-tenant outbox attachment impossible even
      // if a future service accidentally supplies a foreign inbox ID.
      assert.equal(receipts.length, 8);
      await assert.rejects(db.apiV1OutboxEvent.create({ data: {
        tenantId: b.id, integrationId: integrationB.id,
        inboxEventId: receipts[0].inboxEventId,
        eventType: 'diagnostic.ping',
      } }));

      // No real payload, nonce or authorization header is stored in envelopes;
      // all records remain held and there are no delivery workers.
      const outboxRows = await db.apiV1OutboxEvent.findMany({
        where: { tenantId: { in: tenantIds } },
      });
      assert.equal(outboxRows.length, 2);
      assert.ok(outboxRows.every(x => x.state === 'held' && x.attempts === 0));
      const inboxRows = await db.apiV1InboxEvent.findMany({
        where: { tenantId: { in: tenantIds } },
      });
      assert.ok(inboxRows.every(x => x.state === 'held'));
      assert.equal(JSON.stringify({ inboxRows, outboxRows }).includes('fixture_a'), false);

      const bad = await recordApiV1DiagnosticEvent({
        authorization: contextA, idempotencyKey: 'short',
        envelope,
      }, db);
      assert.equal(bad.status, 'denied');
      const noScope = await recordApiV1DiagnosticEvent({
        authorization: { ...contextA, scope: 'integrations.read' } as ApiV1Authorization,
        idempotencyKey: 'synthetic-other-key', envelope,
      }, db);
      assert.equal(noScope.status, 'denied');

      process.env.FLIPFORM_API_V1_ENABLED = 'false';
      assert.equal((await recordApiV1DiagnosticEvent({
        authorization: contextA, idempotencyKey: 'synthetic-disabled-key', envelope,
      }, db)).status, 'denied');
      assert.equal(await db.apiV1InboxEvent.count({ where: { tenantId: a.id } }), 1);
    } finally {
      if (tenantIds.length) {
        const where = { tenantId: { in: tenantIds } };
        await db.apiV1OutboxEvent.deleteMany({ where });
        await db.apiV1InboxEvent.deleteMany({ where });
        await db.apiV1IdempotencyRecord.deleteMany({ where });
        await db.apiV1QuotaBucket.deleteMany({ where });
        await db.apiCredential.deleteMany({ where });
        await db.apiIntegration.deleteMany({ where });
        await db.subscription.deleteMany({ where });
        await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      if (createdPlan && planId) await db.plan.delete({ where: { id: planId } });
      if (oldFlag === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED = oldFlag;
      await db.$disconnect();
    }
  },
);
