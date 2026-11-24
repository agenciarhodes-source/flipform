import assert from 'node:assert/strict';
import test from 'node:test';
import { decideLoginTenant, type LoginTenantMembership } from '../lib/auth/tenant-login-selection';

const internal: LoginTenantMembership = {
  tenantId: '11111111-1111-4111-8111-111111111111', role: 'owner',
  tenant: { name: 'Acesso interno', slug: 'internal', status: 'active' },
};
const pollo: LoginTenantMembership = {
  tenantId: '22222222-2222-4222-8222-222222222222', role: 'owner',
  tenant: { name: 'Agencia Pollo', slug: 'agencia-pollo', status: 'active' },
};
const revoked: LoginTenantMembership = {
  tenantId: '33333333-3333-4333-8333-333333333333', role: 'owner',
  tenant: { name: 'Cliente bloqueado', slug: 'blocked', status: 'blocked' },
};

test('one allowed tenant retains existing automatic sign-in behavior', () => {
  const result = decideLoginTenant([internal, pollo], new Set([internal.tenantId]));
  assert.equal(result.kind, 'ready');
  if (result.kind === 'ready') assert.equal(result.membership.tenantId, internal.tenantId);
});
test('after allowlist reconciliation, two companies require explicit selection', () => {
  const allow = new Set([internal.tenantId, pollo.tenantId]);
  const result = decideLoginTenant([internal, pollo], allow);
  assert.equal(result.kind, 'choose');
  if (result.kind === 'choose') {
    assert.equal(result.choices.length, 2);
    assert.deepEqual(result.choices.map(x => x.name), ['Acesso interno', 'Agencia Pollo']);
  }
  const chosen = decideLoginTenant([internal, pollo], allow, pollo.tenantId);
  assert.equal(chosen.kind, 'ready');
  if (chosen.kind === 'ready') assert.equal(chosen.membership.tenantId, pollo.tenantId);
});
test('unknown, unlisted, disabled, and revoked companies cannot be chosen by ID', () => {
  const membership = [internal, pollo, revoked];
  const allow = new Set([internal.tenantId, revoked.tenantId]);
  assert.equal(decideLoginTenant(membership, allow, pollo.tenantId).kind, 'denied');
  assert.equal(decideLoginTenant(membership, allow, revoked.tenantId).kind, 'denied');
  assert.equal(decideLoginTenant(membership, allow, '99999999-9999-4999-8999-999999999999').kind, 'denied');
  const choice = decideLoginTenant(membership, allow);
  assert.equal(choice.kind, 'ready');
  if (choice.kind === 'ready') assert.equal(choice.membership.tenantId, internal.tenantId);
});
test('no active allowed membership always denies sign-in', () => {
  assert.equal(decideLoginTenant([pollo], new Set()).kind, 'denied');
  assert.equal(decideLoginTenant([revoked], new Set([revoked.tenantId])).kind, 'denied');
  assert.equal(decideLoginTenant([], new Set()).kind, 'denied');
});
