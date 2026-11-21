import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GET as getLeads } from '../app/api/v1/leads/route';
import { GET as getLeadDetail } from '../app/api/v1/leads/[leadId]/route';
import { digestApiV1Secret } from '../lib/api-v1/identity';

function requireDisposableDb(): void {
  if (process.env.CI !== 'true') throw Error('PR02 DB tests are CI-only');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:','postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.username !== 'postgres' || url.pathname !== '/flipform_ci') {
    throw Error('PR02 lead metadata tests only accept disposable local PostgreSQL');
  }
}

test('lead metadata list: two-tenant isolation, pagination, scopes, suspension and revocation', {
  skip: process.env.CI !== 'true',
}, async () => {
  requireDisposableDb();
  const db = new PrismaClient();
  const oldFlag = process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED = 'true';
  const suffix = randomUUID().replace(/-/g,'').slice(0,12);
  const tenantIds: string[] = [];
  let createdPlanId: string | null = null;
  try {
    let plan=await db.plan.findUnique({where:{slug:'premium'}});
    if(!plan) {
      plan=await db.plan.create({data:{
        slug:'premium',name:'PR02 synthetic premium',price:997,isActive:true,
      }});
      createdPlanId=plan.id;
    }
    const [tenantA,tenantB]=await Promise.all([
      db.tenant.create({data:{name:'PR02 Lead metadata A',slug:'pr02-leads-a-'+suffix}}),
      db.tenant.create({data:{name:'PR02 Lead metadata B',slug:'pr02-leads-b-'+suffix}}),
    ]);
    tenantIds.push(tenantA.id,tenantB.id);
    await db.subscription.createMany({data:tenantIds.map(tenantId=>({
      tenantId,planId:plan.id,status:'active',provider:'pr02-synthetic',
    }))});
    const [pipelineA,pipelineB]=await Promise.all([
      db.pipeline.create({data:{tenantId:tenantA.id,name:'Synthetic A'}}),
      db.pipeline.create({data:{tenantId:tenantB.id,name:'Synthetic B'}}),
    ]);
    const [stageA,stageB]=await Promise.all([
      db.pipelineStage.create({data:{pipelineId:pipelineA.id,name:'A stage',orderIndex:0}}),
      db.pipelineStage.create({data:{pipelineId:pipelineB.id,name:'B stage',orderIndex:0}}),
    ]);
    const [leadA1,leadA2,leadB]=await Promise.all([
      db.lead.create({data:{tenantId:tenantA.id,pipelineId:pipelineA.id,stageId:stageA.id,name:'SECRET A1',email:'secret-a1@example.invalid'}}),
      db.lead.create({data:{tenantId:tenantA.id,pipelineId:pipelineA.id,stageId:stageA.id,name:'SECRET A2',phone:'+550000000001'}}),
      db.lead.create({data:{tenantId:tenantB.id,pipelineId:pipelineB.id,stageId:stageB.id,name:'SECRET B',phone:'+550000000002'}}),
    ]);
    const [integrationA,integrationB]=await Promise.all([
      db.apiIntegration.create({data:{tenantId:tenantA.id,displayName:'Leads A',status:'active'}}),
      db.apiIntegration.create({data:{tenantId:tenantB.id,displayName:'Leads B',status:'active'}}),
    ]);
    const secretA=Buffer.alloc(32,71),secretB=Buffer.alloc(32,72),secretDenied=Buffer.alloc(32,73);
    const [keyA,keyB,keyDenied]=await Promise.all([
      db.apiCredential.create({data:{tenantId:tenantA.id,integrationId:integrationA.id,
        secretHashHex:digestApiV1Secret(secretA),scopes:['leads.metadata.read'],
        expiresAt:new Date('2031-01-01T00:00:00Z')}}),
      db.apiCredential.create({data:{tenantId:tenantB.id,integrationId:integrationB.id,
        secretHashHex:digestApiV1Secret(secretB),scopes:['leads.metadata.read'],
        expiresAt:new Date('2031-01-01T00:00:00Z')}}),
      db.apiCredential.create({data:{tenantId:tenantA.id,integrationId:integrationA.id,
        secretHashHex:digestApiV1Secret(secretDenied),scopes:['pipelines.read'],
        expiresAt:new Date('2031-01-01T00:00:00Z')}}),
    ]);
    const bearer=(id:string,secret:Buffer)=>'ffv1.'+id+'.'+secret.toString('base64url');
    const tokenA=bearer(keyA.id,secretA),tokenB=bearer(keyB.id,secretB);
    const tokenDenied=bearer(keyDenied.id,secretDenied);
    const request=(token:string|null,query='')=>getLeads(new Request(
      'https://example.invalid/api/v1/leads'+query,{
        headers:token?{authorization:'Bearer '+token}:{},
      }));
    assert.equal((await request(null)).status,401);
    assert.equal((await request(tokenDenied)).status,403);
    assert.equal((await request(tokenA,'?tenantId='+tenantB.id)).status,400);
    assert.equal((await request(tokenA,'?limit=51')).status,400);
    const sortedA=[leadA1.id,leadA2.id].sort();
    const first=await request(tokenA,'?limit=1&pipelineId='+pipelineA.id);
    assert.equal(first.status,200);
    assert.equal(first.headers.get('Cache-Control'),'private, no-store');
    const a1=await first.json() as {items:Array<Record<string,unknown>>;nextCursor:string|null};
    assert.equal(a1.items.length,1);
    assert.equal(a1.items[0].id,sortedA[0]);
    assert.deepEqual(Object.keys(a1.items[0]).sort(),
      ['id','formId','pipelineId','stageId','status','createdAt','updatedAt'].sort());
    assert.equal(a1.nextCursor,sortedA[0]);
    const next=await request(tokenA,'?limit=1&after='+a1.nextCursor);
    assert.equal(next.status,200);
    const a2=await next.json() as {items:Array<{id:string}>;nextCursor:string|null};
    assert.deepEqual(a2.items.map(x=>x.id),[sortedA[1]]);
    assert.equal(a2.nextCursor,null);
    assert.equal(JSON.stringify(a1).includes('SECRET A1'),false);
    assert.equal(JSON.stringify(a1).includes('secret-a1@example.invalid'),false);
    assert.equal(JSON.stringify(a2).includes('+550000000001'),false);
    const b=await request(tokenB);
    assert.equal(b.status,200);
    const bBody=await b.json() as {items:Array<{id:string}>};
    assert.deepEqual(bBody.items.map(x=>x.id),[leadB.id]);
    const noCross=await request(tokenA,'?pipelineId='+pipelineB.id);
    assert.equal(noCross.status,200);
    const noCrossBody=await noCross.json() as {items:unknown[]};
    assert.deepEqual(noCrossBody.items,[]);
    // Point lookup reuses the credential and never returns private contact fields.
    const detailRequest=(leadId:string,token:string|null,query='')=>getLeadDetail(
      new Request('https://example.invalid/api/v1/leads/'+leadId+query,{
        headers:token?{authorization:'Bearer '+token}:{},
      }),{params:Promise.resolve({leadId})});
    assert.equal((await detailRequest(leadA1.id,null)).status,401);
    assert.equal((await detailRequest(leadA1.id,tokenDenied)).status,403);
    assert.equal((await detailRequest(leadA1.id,tokenA,'?includeAnswers=true')).status,400);
    assert.equal((await detailRequest('bad-id',tokenA)).status,400);
    assert.equal((await detailRequest(leadB.id,tokenA)).status,404);
    assert.equal((await detailRequest(leadA1.id,tokenB)).status,404);
    const detailResponse=await detailRequest(leadA1.id,tokenA);
    assert.equal(detailResponse.status,200);
    assert.equal(detailResponse.headers.get('Cache-Control'),'private, no-store');
    const detail=await detailResponse.json() as {version:string;item:Record<string,unknown>};
    assert.equal(detail.version,'v1');
    assert.equal(detail.item.id,leadA1.id);
    assert.deepEqual(Object.keys(detail.item).sort(),
      ['id','formId','pipelineId','stageId','status','createdAt','updatedAt'].sort());
    assert.equal(JSON.stringify(detail).includes('SECRET A1'),false);
    assert.equal(JSON.stringify(detail).includes('secret-a1@example.invalid'),false);
    await db.tenant.update({where:{id:tenantA.id},data:{status:'suspended'}});
    assert.equal((await request(tokenA)).status,403);
    assert.equal((await detailRequest(leadA1.id,tokenA)).status,403);
    await db.tenant.update({where:{id:tenantA.id},data:{status:'active'}});
    await db.apiCredential.update({where:{id:keyA.id},data:{revokedAt:new Date()}});
    assert.equal((await request(tokenA)).status,401);
    assert.equal((await detailRequest(leadA1.id,tokenA)).status,401);
    process.env.FLIPFORM_API_V1_ENABLED='false';
    assert.equal((await request(tokenB)).status,404);
    assert.equal((await detailRequest(leadB.id,tokenB)).status,404);
  } finally {
    if(tenantIds.length) {
      const where={tenantId:{in:tenantIds}};
      await db.apiV1QuotaBucket.deleteMany({where});
      await db.apiCredential.deleteMany({where});
      await db.apiIntegration.deleteMany({where});
      await db.lead.deleteMany({where});
      await db.pipelineStage.deleteMany({where:{pipeline:{tenantId:{in:tenantIds}}}});
      await db.pipeline.deleteMany({where});
      await db.subscription.deleteMany({where});
      await db.tenant.deleteMany({where:{id:{in:tenantIds}}});
    }
    if(createdPlanId)await db.plan.delete({where:{id:createdPlanId}});
    if(oldFlag===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=oldFlag;
    await db.$disconnect();
  }
});
