import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { ApiV1Authorization } from '../lib/api-v1/identity';
import { listApiV1LeadMetadata, parseLeadsMetadataQuery } from '../lib/api-v1/leads-metadata-read';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTH: ApiV1Authorization = {
  ok:true,tenantId:'tenant-a',integrationId:'integration-a',scope:'leads.metadata.read',
};

test('lead metadata parser accepts only bounded cursor, limit and pipeline filter',()=>{
  assert.deepEqual(parseLeadsMetadataQuery('https://example.invalid/api/v1/leads'),{
    limit:20,after:null,pipelineId:null,
  });
  assert.deepEqual(parseLeadsMetadataQuery('https://example.invalid/api/v1/leads?limit=1&after='+A+'&pipelineId='+B),{
    limit:1,after:A,pipelineId:B,
  });
  for(const bad of ['?limit=0','?limit=51','?limit=01','?after=bad','?after=','?pipelineId=bad',
    '?tenantId=tenant-b','?includeAnswers=true','?email=true','?limit=1&limit=2',
    '?pipelineId='+A+'&pipelineId='+B]) {
    assert.equal(parseLeadsMetadataQuery('https://example.invalid/api/v1/leads'+bad),null,bad);
  }
});

test('metadata reader uses credential tenant and a minimal explicit SELECT',async()=>{
  const old=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const recorded:unknown[]=[];
    const sample=[
      {id:A,formId:null,pipelineId:B,stageId:A,status:'open',createdAt:new Date('2026-01-01T00:00:00Z')},
      {id:B,formId:null,pipelineId:B,stageId:B,status:'open',createdAt:new Date('2026-01-02T00:00:00Z')},
    ];
    const db = {lead:{findMany:async(q:unknown)=>{recorded.push(q);return sample;}}} as unknown as Pick<PrismaClient,'lead'>;
    const result=await listApiV1LeadMetadata(AUTH,{limit:1,after:null,pipelineId:B},db);
    assert.deepEqual(result,{items:[sample[0]],nextCursor:A});
    const query=recorded[0] as {where:{tenantId:string;pipelineId:string;id?:unknown};
      select:Record<string,boolean>;take:number;orderBy:unknown};
    assert.deepEqual(query.where,{tenantId:'tenant-a',pipelineId:B});
    assert.equal(query.take,2);
    assert.deepEqual(Object.keys(query.select).sort(),
      ['id','formId','pipelineId','stageId','status','createdAt'].sort());
    for(const sensitive of ['name','email','phone','answers','messages','notes','tags','documents','saleValueCents']) {
      assert.equal(Object.prototype.hasOwnProperty.call(query.select,sensitive),false);
    }
    assert.deepEqual(await listApiV1LeadMetadata({...AUTH,scope:'pipelines.read'},
      {limit:1,after:null,pipelineId:null},db),null);
    process.env.FLIPFORM_API_V1_ENABLED='false';
    assert.equal(await listApiV1LeadMetadata(AUTH,{limit:1,after:null,pipelineId:null},db),null);
    assert.equal(recorded.length,1);
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});

test('metadata reader enforces cursor and fails closed on database errors',async()=>{
  const old=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const db = {lead:{findMany:async()=>{throw Error('private database');}}} as unknown as Pick<PrismaClient,'lead'>;
    assert.equal(await listApiV1LeadMetadata(AUTH,{limit:20,after:null,pipelineId:null},db),null);
    assert.equal(await listApiV1LeadMetadata(AUTH,{limit:1000,after:null,pipelineId:null},db),null);
    assert.equal(await listApiV1LeadMetadata(AUTH,{limit:1,after:'bad',pipelineId:null},db),null);
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});
