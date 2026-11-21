import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GET as getForms } from '../app/api/v1/forms/route';
import { digestApiV1Secret } from '../lib/api-v1/identity';

function requireDisposableDb(): void {
  if (process.env.CI !== 'true') throw Error('PR02 DB tests are CI-only');
  const db = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(db.protocol)
    || db.hostname !== '127.0.0.1' || db.port !== '5432'
    || db.username !== 'postgres' || db.pathname !== '/flipform_ci') {
    throw Error('PR02 requires disposable local PostgreSQL');
  }
}

test('forms endpoint isolates two tenants and denies wrong scopes, suspended and revoked keys',
  { skip: process.env.CI !== 'true' }, async () => {
    requireDisposableDb();
    const db = new PrismaClient();
    const old = process.env.FLIPFORM_API_V1_ENABLED;
    process.env.FLIPFORM_API_V1_ENABLED = 'true';
    const suffix = randomUUID().slice(0, 12);
    const tenants: string[] = [];
    let planCreated: string | null = null;
    try {
      let plan = await db.plan.findUnique({ where: { slug: 'premium' } });
      if (!plan) {
        plan = await db.plan.create({ data: {
          slug: 'premium', name: 'PR02 synthetic premium', price: 997, isActive: true,
        } });
        planCreated = plan.id;
      }
      const [a, b] = await Promise.all([
        db.tenant.create({ data: { name: 'PR02 Form A', slug: 'pr02-forms-a-' + suffix } }),
        db.tenant.create({ data: { name: 'PR02 Form B', slug: 'pr02-forms-b-' + suffix } }),
      ]);
      tenants.push(a.id, b.id);
      await db.subscription.createMany({ data: tenants.map(tenantId => ({
        tenantId, planId: plan.id, status: 'active', provider: 'pr02-forms-synthetic',
      })) });
      const [aPipe,bPipe] = await Promise.all([
        db.pipeline.create({ data: { tenantId: a.id, name: 'Synthetic A' } }),
        db.pipeline.create({ data: { tenantId: b.id, name: 'Synthetic B' } }),
      ]);
      const [aStage,bStage] = await Promise.all([
        db.pipelineStage.create({ data: { pipelineId: aPipe.id, name: 'New A', orderIndex: 0 } }),
        db.pipelineStage.create({ data: { pipelineId: bPipe.id, name: 'New B', orderIndex: 0 } }),
      ]);
      const [activeA,inactiveA,activeB] = await Promise.all([
        db.form.create({ data: { tenantId: a.id, name: 'A active', publicTitle: 'Public A',
          slug: 'a-'+suffix, pipelineId: aPipe.id, initialStageId: aStage.id } }),
        db.form.create({ data: { tenantId: a.id, name: 'A inactive', publicTitle: 'Hidden A',
          slug: 'a-hidden-'+suffix, pipelineId: aPipe.id, initialStageId: aStage.id, isActive: false } }),
        db.form.create({ data: { tenantId: b.id, name: 'B private', publicTitle: 'Private B',
          slug: 'b-'+suffix, pipelineId: bPipe.id, initialStageId: bStage.id } }),
      ]);
      const [intA,intB] = await Promise.all([
        db.apiIntegration.create({ data: { tenantId: a.id, displayName: 'Forms A', status: 'active' } }),
        db.apiIntegration.create({ data: { tenantId: b.id, displayName: 'Forms B', status: 'active' } }),
      ]);
      const secretA = Buffer.alloc(32, 42), secretB = Buffer.alloc(32, 43);
      const [keyA,keyB] = await Promise.all([
        db.apiCredential.create({ data: { tenantId: a.id, integrationId: intA.id,
          secretHashHex: digestApiV1Secret(secretA), scopes: ['forms.read'],
          expiresAt: new Date('2031-01-01T00:00:00Z') } }),
        db.apiCredential.create({ data: { tenantId: b.id, integrationId: intB.id,
          secretHashHex: digestApiV1Secret(secretB), scopes: ['pipelines.read'],
          expiresAt: new Date('2031-01-01T00:00:00Z') } }),
      ]);
      const tokenA = 'ffv1.' + keyA.id + '.' + secretA.toString('base64url');
      const tokenB = 'ffv1.' + keyB.id + '.' + secretB.toString('base64url');
      const request = (token: string | null, q = '') =>
        getForms(new Request('https://example.invalid/api/v1/forms'+q, {
          headers: token ? { authorization: 'Bearer '+token } : {},
        }));
      assert.equal((await request(null)).status, 401);
      assert.equal((await request(tokenB)).status, 403);
      assert.equal((await request(tokenA,'?tenantId='+b.id)).status, 400);
      assert.equal((await request(tokenA,'?limit=51')).status, 400);
      const ok = await request(tokenA,'?limit=1');
      assert.equal(ok.status, 200);
      const body = await ok.json() as {
        version: string; items: Array<Record<string, unknown>>; nextCursor: string | null;
      };
      assert.equal(body.version, 'v1');
      assert.deepEqual(body.items, [{
        id: activeA.id, name: activeA.name,
        pipelineId: aPipe.id, initialStageId: aStage.id, leadSource: 'formulario',
      }]);
      assert.equal(body.nextCursor, null);
      assert.equal(JSON.stringify(body).includes('B private'), false);
      assert.equal(JSON.stringify(body).includes('A inactive'), false);
      assert.equal(JSON.stringify(body).includes('slug'), false);
      assert.equal(JSON.stringify(body).includes('publicTitle'), false);
      await db.tenant.update({ where: { id: a.id }, data: { status: 'suspended' } });
      assert.equal((await request(tokenA)).status, 403);
      await db.tenant.update({ where: { id: a.id }, data: { status: 'active' } });
      await db.apiCredential.update({ where: { id: keyA.id }, data: { revokedAt: new Date() } });
      assert.equal((await request(tokenA)).status, 401);
      process.env.FLIPFORM_API_V1_ENABLED = 'false';
      assert.equal((await request(tokenA)).status, 404);
      void inactiveA; void activeB; // fixtures included to prove filtering.
    } finally {
      if (tenants.length) {
        const scoped={tenantId:{in:tenants}};
        await db.apiV1QuotaBucket.deleteMany({where:scoped});
        await db.apiCredential.deleteMany({where:scoped});
        await db.apiIntegration.deleteMany({where:scoped});
        await db.form.deleteMany({where:scoped});
        await db.pipelineStage.deleteMany({where:{pipeline:{tenantId:{in:tenants}}}});
        await db.pipeline.deleteMany({where:scoped});
        await db.subscription.deleteMany({where:scoped});
        await db.tenant.deleteMany({where:{id:{in:tenants}}});
      }
      if(planCreated)await db.plan.delete({where:{id:planCreated}});
      if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
      else process.env.FLIPFORM_API_V1_ENABLED=old;
      await db.$disconnect();
    }
  });
