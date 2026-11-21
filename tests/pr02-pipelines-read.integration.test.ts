import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GET as getPipelines } from '../app/api/v1/pipelines/route';
import { digestApiV1Secret } from '../lib/api-v1/identity';

function assertDisposableOnly(): void {
  if (process.env.CI !== 'true') throw new Error('PR02 tests are CI-only');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/flipform_ci' || url.username !== 'postgres') {
    throw new Error('PR02 only accepts disposable local PostgreSQL');
  }
}

test('PR02 read-only pipeline list: tenant isolation, scope, pagination, archive and kill switch',
  { skip: process.env.CI !== 'true' },
  async () => {
    assertDisposableOnly();
    const db = new PrismaClient();
    const previous = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true';
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenantIds: string[] = [];
    let ownPlanId: string | null = null;
    try {
      let plan = await db.plan.findUnique({ where: { slug: 'premium' } });
      if (!plan) {
        plan = await db.plan.create({ data: {
          slug: 'premium', name: 'PR02 synthetic Premium', price: 997, isActive: true,
        } });
        ownPlanId = plan.id;
      }
      const [a, b] = await Promise.all([
        db.tenant.create({ data: { name: 'PR02 A', slug: 'pr02-a-' + suffix } }),
        db.tenant.create({ data: { name: 'PR02 B', slug: 'pr02-b-' + suffix } }),
      ]);
      tenantIds.push(a.id, b.id);
      await db.subscription.createMany({ data: tenantIds.map(tenantId => ({
        tenantId, planId: plan.id, status: 'active', provider: 'pr02-synthetic',
      })) });
      const [integrationA, integrationB] = await Promise.all([
        db.apiIntegration.create({ data: { tenantId: a.id, displayName: 'PR02 A', status: 'active' } }),
        db.apiIntegration.create({ data: { tenantId: b.id, displayName: 'PR02 B', status: 'active' } }),
      ]);
      const secretA = Buffer.alloc(32, 31);
      const secretB = Buffer.alloc(32, 37);
      const [credentialA, credentialB] = await Promise.all([
        db.apiCredential.create({ data: {
          tenantId: a.id, integrationId: integrationA.id,
          secretHashHex: digestApiV1Secret(secretA), scopes: ['pipelines.read'],
          expiresAt: new Date('2031-01-01T00:00:00Z'),
        } }),
        db.apiCredential.create({ data: {
          tenantId: b.id, integrationId: integrationB.id,
          secretHashHex: digestApiV1Secret(secretB), scopes: ['pipelines.read'],
          expiresAt: new Date('2031-01-01T00:00:00Z'),
        } }),
      ]);
      const [pA, pB, pArchived] = await Promise.all([
        db.pipeline.create({ data: { tenantId: a.id, name: 'A primary', isDefault: true } }),
        db.pipeline.create({ data: { tenantId: b.id, name: 'B private' } }),
        db.pipeline.create({ data: { tenantId: a.id, name: 'A hidden', isArchived: true } }),
      ]);
      await db.pipelineStage.createMany({ data: [
        { pipelineId: pA.id, name: 'Open', color: '#111111', orderIndex: 0 },
        { pipelineId: pA.id, name: 'Closed', color: '#222222', orderIndex: 1, isArchived: true },
        { pipelineId: pB.id, name: 'B stage', color: '#333333', orderIndex: 0 },
      ] });
      const tokenA = 'ffv1.' + credentialA.id + '.' + secretA.toString('base64url');
      const tokenB = 'ffv1.' + credentialB.id + '.' + secretB.toString('base64url');
      const request = (token: string | null, query = '') =>
        getPipelines(new Request('https://example.invalid/api/v1/pipelines' + query, {
          headers: token ? { authorization: 'Bearer ' + token } : {},
        }));
      assert.equal((await request(null)).status, 401);
      const okA = await request(tokenA, '?limit=1');
      assert.equal(okA.status, 200);
      const bodyA = await okA.json() as {
        items: Array<{ id: string; name: string; stages: Array<{ name: string }> }>;
        nextCursor: string | null;
      };
      assert.equal(bodyA.items.length, 1);
      assert.equal(bodyA.items[0].id, pA.id);
      assert.equal(bodyA.items[0].stages.length, 1);
      assert.equal(bodyA.items[0].stages[0].name, 'Open');
      assert.equal(bodyA.nextCursor, null);
      assert.equal(JSON.stringify(bodyA).includes('B private'), false);
      assert.equal(JSON.stringify(bodyA).includes('A hidden'), false);
      assert.equal(JSON.stringify(bodyA).includes('email'), false);
      const okB = await request(tokenB);
      assert.equal(okB.status, 200);
      const bodyB = await okB.json() as { items: Array<{ id: string }> };
      assert.deepEqual(bodyB.items.map(x => x.id), [pB.id]);
      assert.equal((await request(tokenA, '?tenantId=' + b.id)).status, 400);
      assert.equal((await request(tokenA, '?limit=51')).status, 400);

      // Enforce credential expiry/revocation + tenant suspension at request time.
      await db.tenant.update({ where: { id: a.id }, data: { status: 'suspended' } });
      assert.equal((await request(tokenA)).status, 403);
      await db.tenant.update({ where: { id: a.id }, data: { status: 'active' } });
      await db.apiCredential.update({ where: { id: credentialA.id }, data: { revokedAt: new Date() } });
      assert.equal((await request(tokenA)).status, 401);
      process.env.FLIPFORM_API_V1_ENABLED = 'false';
      assert.equal((await request(tokenB)).status, 404);
    } finally {
      if (tenantIds.length) {
        const where = { tenantId: { in: tenantIds } };
        await db.apiV1QuotaBucket.deleteMany({ where });
        await db.apiCredential.deleteMany({ where });
        await db.apiIntegration.deleteMany({ where });
        await db.pipelineStage.deleteMany({ where: { pipeline: { tenantId: { in: tenantIds } } } });
        await db.pipeline.deleteMany({ where });
        await db.subscription.deleteMany({ where });
        await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      if (ownPlanId) await db.plan.delete({ where: { id: ownPlanId } });
      if (previous === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED = previous;
      await db.$disconnect();
    }
  });
