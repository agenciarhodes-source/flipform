import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GET as getMetrics } from '../app/api/v1/pipelines/[pipelineId]/metrics/route';
import { digestApiV1Secret } from '../lib/api-v1/identity';

function requireDisposableDb(): void {
  if (process.env.CI !== 'true') throw Error('Metrics integration tests are CI-only');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/flipform_ci' || url.username !== 'postgres') {
    throw Error('Only disposable local PostgreSQL may be used');
  }
}

test('pipeline metrics isolate two tenants and enforce dedicated read-only scope', {
  skip: process.env.CI !== 'true',
}, async () => {
  requireDisposableDb();
  const db = new PrismaClient();
  const oldFlag = process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED = 'true';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const tenants: string[] = [];
  let createdPlanId: string | null = null;
  try {
    let plan = await db.plan.findUnique({ where: { slug: 'premium' } });
    if (!plan) {
      plan = await db.plan.create({ data: {
        slug: 'premium', name: 'PR02 synthetic premium', price: 997, isActive: true,
      } });
      createdPlanId = plan.id;
    }
    const [a, b] = await Promise.all([
      db.tenant.create({ data: { name: 'PR02 Metrics A', slug: 'pr02-metrics-a-'+suffix } }),
      db.tenant.create({ data: { name: 'PR02 Metrics B', slug: 'pr02-metrics-b-'+suffix } }),
    ]);
    tenants.push(a.id, b.id);
    await db.subscription.createMany({ data: tenants.map(tenantId => ({
      tenantId, planId: plan.id, status: 'active', provider: 'pr02-synthetic',
    })) });
    const [pA, pB] = await Promise.all([
      db.pipeline.create({ data: { tenantId: a.id, name: 'Synthetic A' } }),
      db.pipeline.create({ data: { tenantId: b.id, name: 'Synthetic B' } }),
    ]);
    const [sA, sArchived, sB] = await Promise.all([
      db.pipelineStage.create({ data: { pipelineId: pA.id, name: 'A open', orderIndex: 0 } }),
      db.pipelineStage.create({ data: { pipelineId: pA.id, name: 'A archived', orderIndex: 1, isArchived: true } }),
      db.pipelineStage.create({ data: { pipelineId: pB.id, name: 'B open', orderIndex: 0 } }),
    ]);
    await db.lead.createMany({ data: [
      { tenantId: a.id, pipelineId: pA.id, stageId: sA.id, name: 'Synthetic A1' },
      { tenantId: a.id, pipelineId: pA.id, stageId: sA.id, name: 'Synthetic A2' },
      { tenantId: a.id, pipelineId: pA.id, stageId: sArchived.id, name: 'Synthetic hidden' },
      { tenantId: b.id, pipelineId: pB.id, stageId: sB.id, name: 'Synthetic B' },
    ] });
    const [integrationA, integrationB] = await Promise.all([
      db.apiIntegration.create({ data: { tenantId: a.id, displayName: 'PR02 Metrics A', status: 'active' } }),
      db.apiIntegration.create({ data: { tenantId: b.id, displayName: 'PR02 Metrics B', status: 'active' } }),
    ]);
    const secretA=Buffer.alloc(32, 61);
    const secretB=Buffer.alloc(32, 62);
    const secretWrong=Buffer.alloc(32, 63);
    const [keyA, keyB, keyWrong] = await Promise.all([
      db.apiCredential.create({ data: { tenantId:a.id,integrationId:integrationA.id,
        secretHashHex:digestApiV1Secret(secretA),scopes:['pipelines.metrics.read'],
        expiresAt:new Date('2031-01-01T00:00:00Z') } }),
      db.apiCredential.create({ data: { tenantId:b.id,integrationId:integrationB.id,
        secretHashHex:digestApiV1Secret(secretB),scopes:['pipelines.metrics.read'],
        expiresAt:new Date('2031-01-01T00:00:00Z') } }),
      db.apiCredential.create({ data: { tenantId:a.id,integrationId:integrationA.id,
        secretHashHex:digestApiV1Secret(secretWrong),scopes:['pipelines.read'],
        expiresAt:new Date('2031-01-01T00:00:00Z') } }),
    ]);
    const bearer=(id:string,secret:Buffer)=>'ffv1.'+id+'.'+secret.toString('base64url');
    const tokenA=bearer(keyA.id,secretA),tokenB=bearer(keyB.id,secretB);
    const tokenWrong=bearer(keyWrong.id,secretWrong);
    const request=(id:string,token:string|null,query='')=>getMetrics(
      new Request('https://example.invalid/api/v1/pipelines/'+id+'/metrics'+query, {
        headers:token?{authorization:'Bearer '+token}:{},
      }),{params:Promise.resolve({pipelineId:id})});
    assert.equal((await request(pA.id,null)).status,401);
    assert.equal((await request(pA.id,tokenWrong)).status,403);
    assert.equal((await request(pA.id,tokenA,'?tenantId='+b.id)).status,400);
    assert.equal((await request(pA.id,tokenB)).status,404);
    const ok=await request(pA.id,tokenA);
    assert.equal(ok.status,200);
    assert.equal(ok.headers.get('Cache-Control'),'private, no-store');
    const body=await ok.json() as {pipelineId:string;total:number;stages:Array<{stageId:string;count:number}>};
    assert.equal(body.pipelineId,pA.id);
    assert.equal(body.total,2);
    assert.deepEqual(body.stages.map(s=>({stageId:s.stageId,count:s.count})),[{stageId:sA.id,count:2}]);
    assert.equal(JSON.stringify(body).includes('Synthetic A1'),false);
    assert.equal(JSON.stringify(body).includes('Synthetic B'),false);
    await db.tenant.update({where:{id:a.id},data:{status:'suspended'}});
    assert.equal((await request(pA.id,tokenA)).status,403);
    await db.tenant.update({where:{id:a.id},data:{status:'active'}});
    await db.apiCredential.update({where:{id:keyA.id},data:{revokedAt:new Date()}});
    assert.equal((await request(pA.id,tokenA)).status,401);
    process.env.FLIPFORM_API_V1_ENABLED='false';
    assert.equal((await request(pB.id,tokenB)).status,404);
  } finally {
    if (tenants.length) {
      const where={tenantId:{in:tenants}};
      await db.apiV1QuotaBucket.deleteMany({where});
      await db.apiCredential.deleteMany({where});
      await db.apiIntegration.deleteMany({where});
      await db.lead.deleteMany({where});
      await db.pipelineStage.deleteMany({where:{pipeline:{tenantId:{in:tenants}}}});
      await db.pipeline.deleteMany({where});
      await db.subscription.deleteMany({where});
      await db.tenant.deleteMany({where:{id:{in:tenants}}});
    }
    if (createdPlanId) await db.plan.delete({where:{id:createdPlanId}});
    if (oldFlag===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=oldFlag;
    await db.$disconnect();
  }
});
