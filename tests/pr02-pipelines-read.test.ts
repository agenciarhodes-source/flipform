import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import {
  listApiV1Pipelines, parseApiV1PipelineQuery,
} from '../lib/api-v1/pipelines-read';
import type { ApiV1Authorization } from '../lib/api-v1/identity';

const TENANT_A = 'tenant-a';
const AUTH: ApiV1Authorization = {
  ok: true, tenantId: TENANT_A, integrationId: 'integration-a', scope: 'pipelines.read',
};
const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('PR02 pipeline query is bounded, explicit and rejects tenant injection', () => {
  assert.deepEqual(parseApiV1PipelineQuery('https://example.invalid/api/v1/pipelines'), {
    limit: 20, after: null,
  });
  assert.deepEqual(parseApiV1PipelineQuery(
    'https://example.invalid/api/v1/pipelines?limit=1&after=' + ID_A,
  ), { limit: 1, after: ID_A });
  for (const query of [
    '?limit=0', '?limit=51', '?limit=-1', '?limit=01', '?limit=1000',
    '?after=anything', '?after=', '?tenantId=tenant-b', '?limit=2&limit=3',
    '?after=' + ID_A + '&after=' + ID_B, '?includeLeads=true',
  ]) assert.equal(parseApiV1PipelineQuery('https://example.invalid/api/v1/pipelines' + query), null, query);
});

test('PR02 uses only the bearer tenant and explicitly hides archived stages', async () => {
  const previous = process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED = 'true';
  try {
    const calls: unknown[] = [];
    const db = { pipeline: { findMany: async (query: unknown) => {
      calls.push(query);
      return [
        { id: ID_A, name: 'Synthetic A', isDefault: true,
          stages: [{ id: 'stage-a', name: 'New', color: '#FFFFFF', orderIndex: 0 }] },
        { id: ID_B, name: 'Synthetic B', isDefault: false, stages: [] },
      ];
    } } } as unknown as Pick<PrismaClient, 'pipeline'>;
    const page = await listApiV1Pipelines(AUTH, { limit: 1, after: null }, db);
    assert.deepEqual(page, {
      items: [{
        id: ID_A, name: 'Synthetic A', isDefault: true,
        stages: [{ id: 'stage-a', name: 'New', color: '#FFFFFF', orderIndex: 0 }],
      }],
      nextCursor: ID_A,
    });
    const query = calls[0] as { where: Record<string, unknown>;
      select: { stages: { where: Record<string, unknown> } }; take: number };
    assert.equal(query.where.tenantId, TENANT_A);
    assert.equal(query.where.isArchived, false);
    assert.equal(query.select.stages.where.isArchived, false);
    assert.equal(query.take, 2);
    assert.equal(JSON.stringify(page).includes('lead'), false);
    assert.equal(await listApiV1Pipelines({
      ...AUTH, scope: 'integrations.read',
    }, { limit: 1, after: null }, db), null);
    assert.equal(calls.length, 1, 'wrong scope must not query');
    process.env.FLIPFORM_API_V1_ENABLED = 'false';
    assert.equal(await listApiV1Pipelines(AUTH, { limit: 1, after: null }, db), null);
    assert.equal(calls.length, 1, 'flag off must not query');
  } finally {
    if (previous === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED = previous;
  }
});

test('PR02 refuses DB errors and impossible page bounds', async () => {
  const previous = process.env.FLIPFORM_API_V1_ENABLED;
  process.env.FLIPFORM_API_V1_ENABLED = 'true';
  try {
    const db = { pipeline: { findMany: async () => { throw Error('private db URL'); } } }
      as unknown as Pick<PrismaClient, 'pipeline'>;
    assert.equal(await listApiV1Pipelines(AUTH, { limit: 1, after: null }, db), null);
    assert.equal(await listApiV1Pipelines(AUTH, { limit: 1000, after: null }, db), null);
    assert.equal(await listApiV1Pipelines(AUTH, { limit: 1, after: ID_B }, db), null);
  } finally {
    if (previous === undefined) delete process.env.FLIPFORM_API_V1_ENABLED;
    else process.env.FLIPFORM_API_V1_ENABLED = previous;
  }
});
