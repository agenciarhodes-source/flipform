import assert from 'node:assert/strict';
import test from 'node:test';
import { canReadTenantSupportKnowledge } from '../lib/suporte-atendimento/access';

for (const role of ['owner', 'admin', 'manager', 'agent']) {
  test('papel interno '+role+' pode consultar próprio tenant com suporte habilitado', () => {
    assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role }, true), true);
  });
}
test('nega visualizador e acesso sem sessão/tenant', () => {
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'viewer' }, true), false);
  assert.equal(canReadTenantSupportKnowledge(null, true), false);
  assert.equal(canReadTenantSupportKnowledge({ tenantId: '', role: 'owner' }, true), false);
});
test('nega acesso quando flag global está desligada', () => {
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }), false);
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }, false), false);
});
test('suporte genérico: nomes de empresas não são allowlist', () => {
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'empresa-b', role: 'agent' }, true), true);
});
