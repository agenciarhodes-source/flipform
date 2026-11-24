import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { ApiV1Authorization } from '../lib/api-v1/identity';
import { readApiV1PipelineMetrics, validPipelineMetricsRequest } from '../lib/api-v1/pipeline-metrics-read';

const PIPE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAGE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAGE_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AUTH: ApiV1Authorization = {
  ok: true, tenantId: 'tenant-a', integrationId: 'integration-a', scope: 'pipelines.metrics.read',
};

test('metrics endpoint refuses query tenant overrides and malformed IDs', () => {
  assert.equal(validPipelineMetricsRequest('https://example.invalid/metrics',PIPE),true);
  assert.equal(validPipelineMetricsRequest('https://example.invalid/metrics?tenantId=other',PIPE),false);
  assert.equal(validPipelineMetricsRequest('https://example.invalid/metrics?includeLeads=true',PIPE),false);
  assert.equal(validPipelineMetricsRequest('https://example.invalid/metrics','bad-id'),false);
});

test('metrics counts scoped leads by stage without selecting any lead row or PII', async () => {
  const old=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    let pipelineQuery: unknown;
    let leadQuery: unknown;
    const db={
      pipeline:{findFirst:async(q:unknown)=>{pipelineQuery=q;return {id:PIPE,stages:[
        {id:STAGE_A,name:'Synthetic open',orderIndex:0},
        {id:STAGE_B,name:'Synthetic won',orderIndex:1},
      ]};}},
      lead:{groupBy:async(q:unknown)=>{leadQuery=q;return [{stageId:STAGE_A,_count:{_all:3}}];}},
    } as unknown as Pick<PrismaClient,'pipeline'|'lead'>;
    const result=await readApiV1PipelineMetrics(AUTH,PIPE,db);
    assert.deepEqual(result,{kind:'ok',pipelineId:PIPE,total:3,stages:[
      {stageId:STAGE_A,name:'Synthetic open',orderIndex:0,count:3},
      {stageId:STAGE_B,name:'Synthetic won',orderIndex:1,count:0},
    ]});
    assert.deepEqual((pipelineQuery as {where:unknown}).where,
      {id:PIPE,tenantId:'tenant-a',isArchived:false});
    const q=leadQuery as {where:unknown;by:string[];_count:unknown};
    assert.deepEqual(q.where,{tenantId:'tenant-a',pipelineId:PIPE,stageId:{in:[STAGE_A,STAGE_B]}});
    assert.deepEqual(q.by,['stageId']);
    assert.deepEqual(q._count,{_all:true});
    assert.equal(JSON.stringify(q).includes('email'),false);
    assert.equal(JSON.stringify(q).includes('phone'),false);
    assert.deepEqual(await readApiV1PipelineMetrics({...AUTH,scope:'pipelines.read'},PIPE,db),{kind:'denied'});
    process.env.FLIPFORM_API_V1_ENABLED='false';
    assert.deepEqual(await readApiV1PipelineMetrics(AUTH,PIPE,db),{kind:'denied'});
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});

test('unknown/archived pipeline and DB errors fail closed',async()=>{
  const old=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const notFound={pipeline:{findFirst:async()=>null}} as unknown as Pick<PrismaClient,'pipeline'|'lead'>;
    assert.deepEqual(await readApiV1PipelineMetrics(AUTH,PIPE,notFound),{kind:'not_found'});
    const failed={pipeline:{findFirst:async()=>{throw Error('sensitive diagnostic');}}} as unknown as Pick<PrismaClient,'pipeline'|'lead'>;
    assert.deepEqual(await readApiV1PipelineMetrics(AUTH,PIPE,failed),{kind:'unavailable'});
    const tooMany={pipeline:{findFirst:async()=>({id:PIPE,stages:Array.from({length:201},(_,i)=>({id:String(i),name:'Synthetic',orderIndex:i}))})}} as unknown as Pick<PrismaClient,'pipeline'|'lead'>;
    assert.deepEqual(await readApiV1PipelineMetrics(AUTH,PIPE,tooMany),{kind:'unavailable'});
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});
