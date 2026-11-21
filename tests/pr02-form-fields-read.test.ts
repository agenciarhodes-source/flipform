import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { ApiV1Authorization } from '../lib/api-v1/identity';
import {
  noFormFieldsQueryParameters, readApiV1FormFields, validApiV1FormId,
} from '../lib/api-v1/form-fields-read';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTH: ApiV1Authorization = {
  ok: true, tenantId: 'tenant-a', integrationId: 'integration-a', scope: 'forms.read',
};

test('form definition endpoint validates ID and refuses query-based tenant injection', () => {
  assert.equal(validApiV1FormId(ID), true);
  assert.equal(validApiV1FormId('abc'), false);
  assert.equal(noFormFieldsQueryParameters('https://example.invalid/api/v1/forms/'+ID+'/fields'), true);
  assert.equal(noFormFieldsQueryParameters('https://example.invalid/api/v1/forms/'+ID+'/fields?tenantId=b'), false);
  assert.equal(noFormFieldsQueryParameters('https://example.invalid/api/v1/forms/'+ID+'/fields?includeAnswers=true'), false);
  assert.equal(noFormFieldsQueryParameters('https://example.invalid/api/v1/forms/'+ID+'/fields?limit=10000'), false);
});

test('form field definition query is minimal, scoped, ordered and capped', async () => {
  const previous=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const calls: unknown[]=[];
    const sample={
      id:ID, fields:[
        {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',label:'Synthetic field',fieldType:'text',isRequired:true,orderIndex:0},
      ],
    };
    const db={form:{findFirst:async(query:unknown)=>{calls.push(query);return sample;}}} as unknown as Pick<PrismaClient,'form'>;
    const result=await readApiV1FormFields(AUTH,ID,db);
    assert.deepEqual(result,{kind:'ok',formId:ID,fields:sample.fields,truncated:false});
    const q=calls[0] as {
      where:{tenantId:string;id:string;isActive:boolean};
      select:{id:boolean;fields:{take:number;select:Record<string,boolean>}};
    };
    assert.deepEqual(q.where,{id:ID,tenantId:'tenant-a',isActive:true});
    assert.equal(q.select.fields.take,101);
    assert.deepEqual(Object.keys(q.select.fields.select).sort(),
      ['id','label','fieldType','isRequired','orderIndex'].sort());
    assert.equal(JSON.stringify(q).includes('answers'),false);
    assert.equal(JSON.stringify(q).includes('validationRules'),false);
    assert.deepEqual(await readApiV1FormFields({...AUTH,scope:'pipelines.read'},ID,db),{kind:'denied'});
    assert.equal(calls.length,1);
    process.env.FLIPFORM_API_V1_ENABLED='false';
    assert.deepEqual(await readApiV1FormFields(AUTH,ID,db),{kind:'denied'});
    assert.equal(calls.length,1);
  } finally {
    if(previous===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=previous;
  }
});

test('form field limit flags truncation and does not leak database errors',async()=>{
  const previous=process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const hundredAndOne=Array.from({length:101},(_,i)=>({
      id:'item-'+i,label:'Field '+i,fieldType:'text',isRequired:false,orderIndex:i,
    }));
    const db={form:{findFirst:async()=>({id:ID,fields:hundredAndOne})}} as unknown as Pick<PrismaClient,'form'>;
    const r=await readApiV1FormFields(AUTH,ID,db);
    assert.equal(r.kind,'ok');
    if(r.kind==='ok'){assert.equal(r.fields.length,100);assert.equal(r.truncated,true);}
    const broken={form:{findFirst:async()=>{throw Error('secret DB string');}}} as unknown as Pick<PrismaClient,'form'>;
    assert.deepEqual(await readApiV1FormFields(AUTH,ID,broken),{kind:'unavailable'});
    const missing={form:{findFirst:async()=>null}} as unknown as Pick<PrismaClient,'form'>;
    assert.deepEqual(await readApiV1FormFields(AUTH,ID,missing),{kind:'not_found'});
  } finally {
    if(previous===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=previous;
  }
});
