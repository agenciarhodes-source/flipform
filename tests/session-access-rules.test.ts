import assert from 'node:assert/strict';
import test from 'node:test';

import { decideSessionAccess, permissionWorksWhenBlocked } from '../lib/session-access-rules';

const base = {
  tokenVersion: 0,
  user: { sessionVersion: 0, globalRole: null },
  tenantId: 't1',
  membership: { role: 'manager', status: 'active' },
  groupRole: null,
  tokenRole: 'owner',
};

test('o papel vem do banco, não do token', () => {
  assert.deepEqual(decideSessionAccess(base), { ok: true, role: 'manager', globalRole: null });
});

test('tokens antigos, sem versão, continuam valendo enquanto ninguém encerrar as sessões', () => {
  assert.equal(decideSessionAccess({ ...base, tokenVersion: undefined }).ok, true);
});

test('encerrar as sessões, remover da equipe ou apagar o usuário corta o acesso', () => {
  assert.deepEqual(decideSessionAccess({ ...base, user: { sessionVersion: 1, globalRole: null } }), { ok: false, reason: 'session_revoked' });
  assert.deepEqual(decideSessionAccess({ ...base, membership: { role: 'agent', status: 'inactive' } }), { ok: false, reason: 'membership_revoked' });
  assert.deepEqual(decideSessionAccess({ ...base, membership: null }), { ok: false, reason: 'membership_revoked' });
  assert.deepEqual(decideSessionAccess({ ...base, user: null }), { ok: false, reason: 'user_missing' });
});

test('quem entra pelo grupo empresarial continua com acesso', () => {
  assert.deepEqual(decideSessionAccess({ ...base, membership: null, groupRole: 'admin' }), { ok: true, role: 'admin', globalRole: null });
});

test('o painel do grupo empresarial (sessão sem empresa) continua funcionando', () => {
  const hub = { ...base, tenantId: '', membership: null, groupRole: 'owner' };
  assert.deepEqual(decideSessionAccess(hub), { ok: true, role: 'owner', globalRole: null });
  assert.deepEqual(decideSessionAccess({ ...hub, groupRole: null }), { ok: false, reason: 'membership_revoked' });
});

test('Super Admin vale só se o banco ainda disser que é', () => {
  const admin = { ...base, tenantId: '', membership: null, user: { sessionVersion: 0, globalRole: 'platform_admin' } };
  assert.deepEqual(decideSessionAccess(admin), { ok: true, role: 'owner', globalRole: 'platform_admin' });
  assert.deepEqual(decideSessionAccess({ ...admin, user: { sessionVersion: 0, globalRole: null } }), { ok: false, reason: 'membership_revoked' });
});

test('empresa bloqueada continua podendo ver e pagar a cobrança', () => {
  assert.equal(permissionWorksWhenBlocked('BILLING_MANAGE'), true);
  assert.equal(permissionWorksWhenBlocked('BILLING_VIEW'), true);
  assert.equal(permissionWorksWhenBlocked('LEADS_VIEW'), false);
});
