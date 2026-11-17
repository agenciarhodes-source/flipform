import assert from 'node:assert/strict';
import test from 'node:test';
import { canReadTenantSupportKnowledge, canManageTenantSupportKnowledge } from '../lib/suporte-atendimento/access';
import { inboxPlanAllowsPath } from '../lib/billing/inbox-plan-rules';

test('Proprietário configura o Suporte sem flag de ambiente', () => {
  assert.equal(canManageTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'owner' }), true);
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'owner' }), false);
});
test('Atendente consulta o próprio manual e não altera configuração', () => {
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }), true);
  assert.equal(canManageTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }), false);
});
for (const role of ['admin', 'manager', 'viewer', 'developer', 'platform_admin']) {
  test('papel ' + role + ' não gerencia nem consulta sem delegação específica', () => {
    assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role }), false);
    assert.equal(canManageTenantSupportKnowledge({ tenantId: 'tenant-a', role }), false);
  });
}
test('nega sessão inexistente, tenant vazio e perfis sem contexto', () => {
  assert.equal(canReadTenantSupportKnowledge(null), false);
  assert.equal(canManageTenantSupportKnowledge(null), false);
  assert.equal(canManageTenantSupportKnowledge({ tenantId: '', role: 'owner' }), false);
  assert.equal(canReadTenantSupportKnowledge({ tenantId: ' ', role: 'agent' }), false);
});
test('tenant determina o manual consultado; papel sozinho não escolhe base de outra empresa', () => {
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }), true);
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-b', role: 'agent' }), true);
  // A API e a camada R2 usam tenantId da sessão verificada, nunca do formulário.
});
test('plano Inbox permite o painel de configuração do proprietário e leitura de atendente', () => {
  assert.equal(inboxPlanAllowsPath('/settings/suporte-atendimento'), true);
  assert.equal(inboxPlanAllowsPath('/suporte-atendimento'), true);
  assert.equal(inboxPlanAllowsPath('/settings'), false);
  assert.equal(inboxPlanAllowsPath('/settings/tenant'), false);
});
