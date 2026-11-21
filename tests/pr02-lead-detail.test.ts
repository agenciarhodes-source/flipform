import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { ApiV1Authorization } from '../lib/api-v1/identity';
import { readApiV1LeadMetadata, validLeadMetadataDetailRequest } from '../lib/api-v1/leads-metadata-read';

const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTH: ApiV1Authorization = {
  ok:true,tenantId:'tenant-a',integrationId:'integration-a',scope:'leads.metadata.read',
};

test('detail route denies unexpected query parameters and invalid UUID',()=>{
  assert.equal(validLeadMetadataDetailRequest('https://example.invalid/leads/'+ID,ID),true);
  assert.equal(validLeadMetadataDetailRequest('https://example.invalid/leads/'+ID+'?tenantId=b',ID),false);
  assert.equal(validLeadMetadataDetailRequest('https://example.invalid/leads/'+ID+'?includeAnswers=true',ID),false);
  assert.equal(validLeadMetadataDetailRequest('https://example.invalid/leads/not-id','not-id'),false);
});

test('detail selects only operational metadata and tenant-owned row',async()=>{
  const old=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const item={id:ID,formId:null,pipelineId:ID,stageId:ID,status:'open',
      createdAt:new Date('2026-01-01T00:00:00Z'),updatedAt:new Date('2026-01-02T00:00:00Z')};
    const calls:unknown[]=[];
    const db={lead:{findFirst:async(q:unknown)=>{calls.push(q);return item;}}}
      as unknown as Pick<PrismaClient,'lead'>;
    assert.deepEqual(await readApiV1LeadMetadata(AUTH,ID,db),{kind:'ok',item});
    const query=calls[0] as {where:{id:string;tenantId:string};select:Record<string,boolean>};
    assert.deepEqual(query.where,{id:ID,tenantId:'tenant-a'});
    assert.deepEqual(Object.keys(query.select).sort(),
      ['id','formId','pipelineId','stageId','status','createdAt','updatedAt'].sort());
    for(const sensitive of ['name','email','phone','answers','notes','tags','documents','conversations','saleValueCents']){
      assert.equal(Object.prototype.hasOwnProperty.call(query.select,sensitive),false);
    }
    assert.deepEqual(await readApiV1LeadMetadata({...AUTH,scope:'pipelines.read'},ID,db),{kind:'denied'});
    assert.equal(calls.length,1);
    process.env.FLIPFORM_API_V1_ENABLED='false';
    assert.deepEqual(await readApiV1LeadMetadata(AUTH,ID,db),{kind:'denied'});
    assert.equal(calls.length,1);
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});

test('other-tenant missing resource, DB failure and malformed identifiers fail closed',async()=>{
  const old=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const missing={lead:{findFirst:async()=>null}} as unknown as Pick<PrismaClient,'lead'>;
    assert.deepEqual(await readApiV1LeadMetadata(AUTH,ID,missing),{kind:'not_found'});
    const broken={lead:{findFirst:async()=>{throw Error('private connection');}}}
      as unknown as Pick<PrismaClient,'lead'>;
    assert.deepEqual(await readApiV1LeadMetadata(AUTH,ID,broken),{kind:'unavailable'});
    assert.deepEqual(await readApiV1LeadMetadata(AUTH,'bad',broken),{kind:'denied'});
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});
