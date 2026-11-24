import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { claimSignedDiagnosticWebhook, computeApiV1WebhookSignature,
  type SignedDiagnosticWebhook } from '../lib/api-v1/webhook-security';

function assertDisposableCI(): void {
  if (process.env.CI !== 'true') throw new Error('Webhook replay integration tests are CI-only');
  const u = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(u.protocol)
    || u.hostname !== '127.0.0.1' || u.port !== '5432'
    || u.pathname !== '/flipform_ci' || u.username !== 'postgres') {
    throw new Error('Webhook replay integration tests require disposable local PostgreSQL');
  }
}

test('signed diagnostic webhook durable replay: 10 concurrent calls, A/B isolation, fail closed',
  { skip: process.env.CI !== 'true' },
  async () => {
    assertDisposableCI();
    const db = new PrismaClient();
    const originalFlag = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true'; // CI runner only
    const now = new Date('2028-11-19T15:00:00.000Z');
    const secret = Buffer.alloc(32, 47); // synthetic bytes: not a provisioned key
    const suffix = randomUUID().slice(0, 9);
    const tenantIds: string[] = [];
    try {
      const a = await db.tenant.create({ data: { name: 'Synthetic webhook A', slug: 'hook-a-' + suffix } });
      const b = await db.tenant.create({ data: { name: 'Synthetic webhook B', slug: 'hook-b-' + suffix } });
      tenantIds.push(a.id, b.id);
      const ia = await db.apiIntegration.create({ data: {
        tenantId: a.id, displayName: 'A synthetic endpoint', status: 'active',
      } });
      const ib = await db.apiIntegration.create({ data: {
        tenantId: b.id, displayName: 'B synthetic endpoint', status: 'active',
      } });
      const makeSigned = (tenantId: string, integrationId: string, nonce: string): SignedDiagnosticWebhook => {
        const raw: SignedDiagnosticWebhook = {
          scope: { tenantId, integrationId },
          unixSeconds: String(Math.floor(now.getTime() / 1000)),
          nonce, rawBody: Buffer.from('{"kind":"diagnostic.ping"}'), signature: '',
        };
        const signature = computeApiV1WebhookSignature(raw, secret);
        assert.ok(signature);
        return { ...raw, signature };
      };
      const requestA = makeSigned(a.id, ia.id, 'fixture_nonce_001_for_replay');
      const attempts = await Promise.all(Array.from({ length: 10 },
        () => claimSignedDiagnosticWebhook(requestA, secret, db, now)));
      assert.equal(attempts.filter(x => x.status === 'accepted').length, 1);
      assert.equal(attempts.filter(x => x.status === 'replay_rejected').length, 9);
      assert.equal(await db.apiV1WebhookReplay.count({ where: { tenantId: a.id } }), 1);
      const rowA = await db.apiV1WebhookReplay.findFirst({ where: { tenantId: a.id } });
      assert.ok(rowA);
      assert.notEqual(rowA.nonceHash, requestA.nonce);
      assert.equal(rowA.nonceHash.length, 64);
      assert.equal(rowA.bodyHash.length, 64);

      // The same nonce in a second tenant has a different scope and is independent.
      const requestB = makeSigned(b.id, ib.id, requestA.nonce);
      assert.deepEqual(await claimSignedDiagnosticWebhook(requestB, secret, db, now),
        { status: 'accepted' });
      assert.equal(await db.apiV1WebhookReplay.count({ where: { tenantId: b.id } }), 1);
      assert.equal(await db.apiV1WebhookReplay.count({}), 2);

      // Valid signature cannot be transplanted to another tenant or altered.
      assert.deepEqual(await claimSignedDiagnosticWebhook({
        ...requestA, scope: requestB.scope,
      }, secret, db, now), { status: 'denied' });
      assert.deepEqual(await claimSignedDiagnosticWebhook({
        ...requestA, rawBody: Buffer.from('{"kind":"diagnostic.pong"}'),
      }, secret, db, now), { status: 'denied' });
      assert.deepEqual(await claimSignedDiagnosticWebhook(requestA, Buffer.alloc(32, 48), db, now),
        { status: 'denied' });
      assert.deepEqual(await claimSignedDiagnosticWebhook(requestA, secret, db,
        new Date(now.getTime() + 301_000)), { status: 'denied' });

      // Even correctly HMAC-signed real customer payload is denied by Draft.
      const unsafeBody: SignedDiagnosticWebhook = {
        ...requestA,
        nonce: 'fixture_nonce_002_with_payload',
        rawBody: Buffer.from('{"kind":"customer.changed","lead":"synthetic"}'),
        signature: '',
      };
      unsafeBody.signature = computeApiV1WebhookSignature(unsafeBody, secret) || '';
      assert.deepEqual(await claimSignedDiagnosticWebhook(unsafeBody, secret, db, now),
        { status: 'denied' });

      await db.apiIntegration.update({ where: { id: ia.id }, data: { status: 'disabled' } });
      const disabled = makeSigned(a.id, ia.id, 'fixture_nonce_003_inactive');
      assert.deepEqual(await claimSignedDiagnosticWebhook(disabled, secret, db, now),
        { status: 'denied' });

      process.env.FLIPFORM_API_V1_ENABLED = 'false';
      const off = makeSigned(b.id, ib.id, 'fixture_nonce_004_flag_off');
      assert.deepEqual(await claimSignedDiagnosticWebhook(off, secret, db, now),
        { status: 'denied' });
      assert.equal(await db.apiV1WebhookReplay.count({}), 2);
      assert.equal(await db.apiV1InboxEvent.count({ where: { tenantId: { in: tenantIds } } }), 0);
      assert.equal(await db.apiV1OutboxEvent.count({ where: { tenantId: { in: tenantIds } } }), 0);
    } finally {
      if (tenantIds.length) {
        await db.apiV1WebhookReplay.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await db.apiIntegration.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      if (originalFlag === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED = originalFlag;
      await db.$disconnect();
    }
  },
);
