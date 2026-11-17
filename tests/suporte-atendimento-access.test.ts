import assert from 'node:assert/strict';
import test from 'node:test';
import { canReadJunqueiraSupportKnowledge } from '../lib/suporte-atendimento/access';

const tenant = 'tenant-piloto-junqueira';
for (const role of ['owner', 'admin', 'manager', 'agent']) {
  test('autoriza papel interno '+role+' no tenant exato', () => {
    assert.equal(canReadJunqueiraSupportKnowledge({ tenantId: tenant, role }, tenant), true);
  });
}
test('nega outro tenant, mesmo com papel de dono', () => {
  assert.equal(canReadJunqueiraSupportKnowledge({ tenantId: 'outro', role: 'owner' }, tenant), false);
});
test('nega visualizador e sessão inválida', () => {
  assert.equal(canReadJunqueiraSupportKnowledge({ tenantId: tenant, role: 'viewer' }, tenant), false);
  assert.equal(canReadJunqueiraSupportKnowledge(null, tenant), false);
});
test('global libera por papel e tenant próprio, sem depender do piloto', () => {
  assert.equal(canReadJunqueiraSupportKnowledge({ tenantId: 'empresa-b', role: 'agent' }, undefined, true), true);
  assert.equal(canReadJunqueiraSupportKnowledge({ tenantId: 'empresa-b', role: 'viewer' }, undefined, true), false);
});
test('nega configuração ausente e não permite wildcard', () => {
  assert.equal(canReadJunqueiraSupportKnowledge({ tenantId: tenant, role: 'agent' }, undefined), false);
  assert.equal(canReadJunqueiraSupportKnowledge({ tenantId: tenant, role: 'agent' }, '*'), false);
});
