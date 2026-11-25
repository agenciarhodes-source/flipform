import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { developerApiAllowed, requiresDeveloperApiAccess } from '../lib/developer-access/route-policy';

test('technical configuration routes are developer-only, including subresources', () => {
  for (const pathname of [
    '/api/integrations', '/api/integrations/api-v1/abc/keys',
    '/api/domains', '/api/domains/abc/verify',
    '/api/automations', '/api/suporte-atendimento/config',
    '/api/whatsapp-ai/settings', '/api/instagram-ai/settings',
    '/api/whatsapp-ai/followups', '/api/flip/learning',
  ]) {
    assert.equal(requiresDeveloperApiAccess(pathname), true, pathname);
    for (const role of ['owner', 'admin', 'manager', 'agent', 'viewer']) {
      assert.equal(developerApiAllowed(pathname, role), false, pathname + ':' + role);
    }
    assert.equal(developerApiAllowed(pathname, 'developer'), true);
  }
});
test('normal business endpoints are unaffected', () => {
  for (const path of ['/api/leads', '/api/billing', '/api/reports', '/api/conversations']) {
    assert.equal(requiresDeveloperApiAccess(path), false);
  }
  assert.equal(requiresDeveloperApiAccess('/api/integrations-malicious'), false);
});
