import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeFeatureGrant } from '../lib/billing/tenant-feature-rules';
test('only an active approved grant is valid', () => {
  const now = new Date('2026-01-02');
  const g = { enabled: true, revokedAt: null, startsAt: new Date('2026-01-01'), expiresAt: new Date('2026-01-03'), approvedBy: 'user', reason: 'approved' };
  assert.equal(activeFeatureGrant(g,now),true);
  for (const change of [{ enabled:false }, { revokedAt:now }, { startsAt:new Date('2026-01-03') }, { expiresAt:now }, { reason:' ' }, { approvedBy:'' }]) assert.equal(activeFeatureGrant({...g,...change},now),false);
});
