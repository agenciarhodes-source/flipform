import assert from 'node:assert/strict';
import test from 'node:test';
import { apiV1PilotTenantAllowed, apiV1Entitled, type ApiV1Entitlement } from '../lib/api-v1/policy';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const base = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'preview',
  FLIPFORM_API_V1_ENABLED: 'true',
};

test('global switch does not activate any tenant until explicitly allowlisted', () => {
  assert.equal(apiV1PilotTenantAllowed(A, base), false);
  assert.equal(apiV1PilotTenantAllowed(A, { ...base, FLIPFORM_API_V1_PILOT_TENANT_IDS: '' }), false);
  assert.equal(apiV1PilotTenantAllowed(A, { ...base, FLIPFORM_API_V1_ENABLED: 'false', FLIPFORM_API_V1_PILOT_TENANT_IDS: A }), false);
});

test('pilot allowlist permits only exact approved tenant UUIDs', () => {
  const env = { ...base, FLIPFORM_API_V1_PILOT_TENANT_IDS: ` ${A.toUpperCase()}, ${B} ` };
  assert.equal(apiV1PilotTenantAllowed(A, env), true);
  assert.equal(apiV1PilotTenantAllowed(B, env), true);
  assert.equal(apiV1PilotTenantAllowed(C, env), false);
  assert.equal(apiV1PilotTenantAllowed(A.slice(0, -1), env), false);
});

test('malformed, wildcards, duplicates and oversize lists fail closed', () => {
  const bad = [
    '*', `${A},*`, `${A},`, `,${A}`, `${A},${A}`,
    `${A},not-a-uuid`, 'tenant-a', ' '.repeat(401),
    [A,B,C,A,B,C,A,B,C,A,B].join(','),
  ];
  for (const v of bad) {
    assert.equal(apiV1PilotTenantAllowed(A, { ...base, FLIPFORM_API_V1_PILOT_TENANT_IDS: v }), false, v);
  }
});

test('Vercel hosted environment cannot bypass pilot check by NODE_ENV=test', () => {
  const hosted = { ...base, NODE_ENV: 'test' };
  assert.equal(apiV1PilotTenantAllowed(A, hosted), false);
  assert.equal(apiV1PilotTenantAllowed(A, { ...hosted, FLIPFORM_API_V1_PILOT_TENANT_IDS: A }), true);
  // Preserve existing synthetic tests that do not run on deployed Vercel instances.
  assert.equal(apiV1PilotTenantAllowed(A, { NODE_ENV: 'test', FLIPFORM_API_V1_ENABLED: 'true' }), true);
});

test('premium entitlement alone cannot override disabled pilot flag', () => {
  const premium: ApiV1Entitlement = {
    tenantId: A, tenantStatus: 'active', subscriptionStatus: 'active',
    planSlug: 'premium-pro', planActive: true,
    featureEnabled: apiV1PilotTenantAllowed(A, base),
    exceptionalGrantActive: true,
  };
  assert.equal(apiV1Entitled(A, premium), false);
  assert.equal(apiV1Entitled(A, { ...premium, featureEnabled: true }), true);
});
