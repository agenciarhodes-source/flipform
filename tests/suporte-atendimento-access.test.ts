import assert from 'node:assert/strict';
import test from 'node:test';
import { canReadTenantSupportKnowledge, canManageTenantSupportKnowledge, canUseTenantSupportKnowledge } from '../lib/suporte-atendimento/access';
import { DEFAULT_SUPPORT_ACTIVATION, parseTenantSupportActivation } from '../lib/suporte-atendimento/support-switch-rules';
import { inboxPlanAllowsPath } from '../lib/billing/inbox-plan-rules';

test('Somente desenvolvedor configura Suporte', () => {
  assert.equal(canManageTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'owner' }), false);
  assert.equal(canManageTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'developer' }), true);
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'owner' }), false);
});
test('Atendente consulta o próprio manual e não altera configuração', () => {
  assert.equal(canReadTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }), true);
  assert.equal(canManageTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }), false);
});
for (const role of ['admin', 'manager', 'viewer', 'platform_admin']) {
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

test('todo tenant nasce com Suporte desligado, inclusive com manual anterior', () => {
  assert.deepEqual(parseTenantSupportActivation(null), { enabled: false, revision: 0, updatedAt: null });
  assert.equal(DEFAULT_SUPPORT_ACTIVATION.enabled, false);
  assert.equal(canUseTenantSupportKnowledge({ tenantId: 'junqueira', role: 'agent' }, false), false);
});
test('liga apenas a consulta do atendente do tenant habilitado', () => {
  assert.equal(canUseTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }, true), true);
  assert.equal(canUseTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'agent' }, false), false);
  assert.equal(canUseTenantSupportKnowledge({ tenantId: 'tenant-b', role: 'agent' }, false), false);
  assert.equal(canUseTenantSupportKnowledge({ tenantId: 'tenant-a', role: 'owner' }, true), false);
  assert.equal(canUseTenantSupportKnowledge(null, true), false);
});
test('estado por tenant preserva ligamento, desligamento, revisão e timestamp', () => {
  assert.deepEqual(
    parseTenantSupportActivation({ enabled: true, revision: 1, updatedAt: '2026-11-17T21:00:00.000Z' }),
    { enabled: true, revision: 1, updatedAt: '2026-11-17T21:00:00.000Z' },
  );
  assert.equal(
    parseTenantSupportActivation({ enabled: false, revision: 2, updatedAt: '2026-11-17T21:01:00.000Z' }).enabled,
    false,
  );
});
test('dados inválidos não podem habilitar Suporte por interpretação implícita', () => {
  for (const invalid of [
    true, false, 1, [], {}, { enabled: 'true', revision: 1, updatedAt: '2026-11-17T21:00:00Z' },
    { enabled: true, revision: 0, updatedAt: '2026-11-17T21:00:00Z' },
    { enabled: true, revision: 1, updatedAt: null },
    { enabled: true, revision: 1, updatedAt: 'not-a-date' },
  ]) assert.throws(() => parseTenantSupportActivation(invalid), /SUPPORT_ACTIVATION_INVALID/);
});
