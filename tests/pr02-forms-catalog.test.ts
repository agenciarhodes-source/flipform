import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { ApiV1Authorization } from '../lib/api-v1/identity';
import { listApiV1Forms, parseApiV1FormsQuery } from '../lib/api-v1/forms-read';

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTH: ApiV1Authorization = {
  ok: true, tenantId: 'tenant-a', integrationId: 'integration-a', scope: 'forms.read',
};

test('forms query rejects tenant overrides, duplicated and malformed paging', () => {
  assert.deepEqual(parseApiV1FormsQuery('https://example.invalid/api/v1/forms'), { limit: 20, after: null });
  assert.deepEqual(parseApiV1FormsQuery('https://example.invalid/api/v1/forms?limit=1&after='+ID_A), {
    limit: 1, after: ID_A,
  });
  for (const query of [
    '?limit=0', '?limit=51', '?limit=01', '?limit=-1',
    '?after=wrong', '?after=', '?limit=2&limit=3',
    '?after='+ID_A+'&after='+ID_B, '?tenantId=tenant-b',
    '?includeAnswers=true', '?formFields=true',
  ]) assert.equal(parseApiV1FormsQuery('https://example.invalid/api/v1/forms'+query), null, query);
});

test('forms reader uses ONLY credential tenant and selects limited safe metadata', async () => {
  const old = process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED = 'true';
  try {
    const calls: unknown[] = [];
    const db = { form: { findMany: async (query: unknown) => {
      calls.push(query);
      return [
        { id: ID_A, name: 'A form', pipelineId: ID_A, initialStageId: ID_B, leadSource: 'formulario' },
        { id: ID_B, name: 'Other A', pipelineId: ID_A, initialStageId: ID_B, leadSource: 'formulario' },
      ];
    } } } as unknown as Pick<PrismaClient, 'form'>;
    const first = await listApiV1Forms(AUTH, { limit: 1, after: null }, db);
    assert.deepEqual(first, {
      items: [{ id: ID_A, name: 'A form', pipelineId: ID_A, initialStageId: ID_B, leadSource: 'formulario' }],
      nextCursor: ID_A,
    });
    const query = calls[0] as {
      where: { tenantId: string; isActive: boolean };
      select: Record<string, boolean>;
      take: number;
    };
    assert.equal(query.where.tenantId, 'tenant-a');
    assert.equal(query.where.isActive, true);
    assert.equal(query.take, 2);
    assert.deepEqual(Object.keys(query.select).sort(),
      ['id', 'name', 'pipelineId', 'initialStageId', 'leadSource'].sort());
    assert.equal(await listApiV1Forms({ ...AUTH, scope: 'pipelines.read' }, { limit: 1, after: null }, db), null);
    assert.equal(calls.length, 1);
    process.env.FLIPFORM_API_V1_ENABLED = 'false';
    assert.equal(await listApiV1Forms(AUTH, { limit: 1, after: null }, db), null);
    assert.equal(calls.length, 1);
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});

test('forms reader denies DB failure or unbounded query without leaking error', async () => {
  const old = process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED='true';
  try {
    const db = { form: { findMany: async () => { throw Error('private DB data'); } } } as unknown as Pick<PrismaClient, 'form'>;
    assert.equal(await listApiV1Forms(AUTH, {limit: 1, after: null}, db), null);
    assert.equal(await listApiV1Forms(AUTH, {limit: 1000, after: null}, db), null);
  } finally {
    if(old===undefined)delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED=old;
  }
});
