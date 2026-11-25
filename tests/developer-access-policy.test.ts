import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canUseDeveloperModule, canIssueDeveloperGrant, companyMayConfigureTechnicalModule, maySwitchDeveloperTenant, TECHNICAL_MODULES, type DeveloperGrant } from '../lib/developer-access/policy';

const grant: DeveloperGrant = {
  userId: 'developer-1', tenantId: 'company-A', status: 'active',
  grantedByPlatformAdmin: true, mfaEnabled: true, mfaVerifiedInSession: true,
};

test('every technical module is denied to company owner/admin/manager', () => {
  for (const role of ['owner', 'admin', 'manager', 'agent', 'viewer']) {
    for (const module of TECHNICAL_MODULES) assert.equal(companyMayConfigureTechnicalModule(role, module), false);
  }
});
test('only active explicit same-tenant developer grant with completed MFA can access', () => {
  for (const module of TECHNICAL_MODULES) {
    assert.equal(canUseDeveloperModule(grant, { userId: grant.userId, tenantId: grant.tenantId }, module), true);
    assert.equal(canUseDeveloperModule(grant, { userId: grant.userId, tenantId: 'company-B' }, module), false);
    assert.equal(canUseDeveloperModule({ ...grant, status: 'revoked' }, { userId: grant.userId, tenantId: grant.tenantId }, module), false);
    assert.equal(canUseDeveloperModule({ ...grant, mfaEnabled: false }, { userId: grant.userId, tenantId: grant.tenantId }, module), false);
    assert.equal(canUseDeveloperModule({ ...grant, mfaVerifiedInSession: false }, { userId: grant.userId, tenantId: grant.tenantId }, module), false);
    assert.equal(canUseDeveloperModule({ ...grant, grantedByPlatformAdmin: false }, { userId: grant.userId, tenantId: grant.tenantId }, module), false);
  }
});
test('only MFA-verified platform administration may issue developer grants', () => {
  assert.equal(canIssueDeveloperGrant({ globalRole: 'platform_admin', mfaVerifiedInSession: true }), true);
  assert.equal(canIssueDeveloperGrant({ globalRole: 'platform_admin', mfaVerifiedInSession: false }), false);
  assert.equal(canIssueDeveloperGrant({ globalRole: null, mfaVerifiedInSession: true }), false);
});
test('tenant switching cannot infer unrestricted cross-tenant access', () => {
  assert.equal(maySwitchDeveloperTenant('developer-1', 'company-A', [grant]), true);
  assert.equal(maySwitchDeveloperTenant('developer-1', 'company-B', [grant]), false);
});
