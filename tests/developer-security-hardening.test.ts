import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  needsFreshTechnicalSession, mayProvisionDeveloperMembership, mayUseDeveloperGrant,
} from '../lib/developer-access/security-rules';

test('every technical session bypasses the 30-second access decision cache', () => {
  assert.equal(needsFreshTechnicalSession({ role: 'developer' }), true);
  assert.equal(needsFreshTechnicalSession({ role: 'viewer', mfaVerifiedAt: 1 }), true);
  assert.equal(needsFreshTechnicalSession({ role: 'owner' }), false);
});
test('grant creation must not revive disabled company memberships or allowlist entries', () => {
  assert.equal(mayProvisionDeveloperMembership({ existingMembership: null, existingAllowlist: null }), true);
  assert.equal(mayProvisionDeveloperMembership({
    existingMembership: { status: 'active' }, existingAllowlist: { status: 'active', active: true },
  }), true);
  for (const status of ['inactive', 'blocked', 'revoked']) {
    assert.equal(mayProvisionDeveloperMembership({
      existingMembership: { status }, existingAllowlist: null,
    }), false);
  }
  for (const entry of [{ status: 'inactive', active: true }, { status: 'active', active: false }]) {
    assert.equal(mayProvisionDeveloperMembership({ existingMembership: null, existingAllowlist: entry }), false);
  }
});
test('technical capability is denied when any tenant or authentication condition fails', () => {
  const valid = { hasGrant: true, revoked: false, mfaVerified: true, mfaEnabled: true,
    membershipActive: true, allowlistActive: true };
  assert.equal(mayUseDeveloperGrant(valid), true);
  for (const key of Object.keys(valid) as Array<keyof typeof valid>) {
    assert.equal(mayUseDeveloperGrant({ ...valid, [key]: !valid[key] }), false, key);
  }
});
