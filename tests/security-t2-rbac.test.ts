// Security protocol T2: what each profile can and cannot do, checked against the real permission table.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PERMISSIONS, can, canDeleteLead, canEditLead, canManageRole, canMoveLead, getLeadScopeForRole,
  type PermissionKey, type RoleName,
} from '../lib/rbac';

const ROLES: RoleName[] = ['owner', 'admin', 'manager', 'agent', 'viewer'];
const WRITE = /_(CREATE|EDIT|DELETE|MANAGE|MOVE|REMOVE|INVITE|DISABLE|EXPORT|TEST|ASSIGN|COMPLETE|REORDER|CHANGE_ROLE|UPDATE_ROLE|CONTACT_WHATSAPP|CREATE_DIRECT)|_EDIT_|_MOVE_|_DELETE_|_CREATE_/;

test('Visualizador só consulta: nenhuma permissão de alteração', () => {
  const writes = (Object.keys(PERMISSIONS) as PermissionKey[]).filter((key) => WRITE.test(key) && can('viewer', key));
  assert.deepEqual(writes, []);
});

test('somente o Dono cobra, exclui leads, formulários e funis e muda configurações', () => {
  for (const key of ['BILLING_VIEW', 'BILLING_MANAGE', 'LEADS_DELETE', 'FORMS_DELETE', 'PIPELINES_DELETE', 'SETTINGS_MANAGE', 'SETTINGS_EDIT'] as PermissionKey[]) {
    assert.deepEqual(ROLES.filter((role) => can(role, key)), ['owner'], key);
  }
  assert.equal(canDeleteLead('owner'), true);
  for (const role of ['admin', 'manager', 'agent', 'viewer']) assert.equal(canDeleteLead(role), false, role);
});

test('equipe, integrações (Meta, Google, WhatsApp), domínios, auditoria e IA: só Dono e Administrador', () => {
  const keys = (Object.keys(PERMISSIONS) as PermissionKey[]).filter((key) => /^(USERS_|INTEGRATIONS_|DOMAINS_|AUDIT_|FLIP_AI_MANAGE)/.test(key));
  assert.ok(keys.length >= 15);
  for (const key of keys) assert.deepEqual(ROLES.filter((role) => can(role, key)), ['owner', 'admin'], key);
});

test('Atendente só vê e mexe nos leads dele', () => {
  assert.deepEqual(getLeadScopeForRole({ role: 'agent', userId: 'u1' }), { assignedTo: 'u1' });
  for (const role of ['owner', 'admin', 'manager', 'viewer']) assert.deepEqual(getLeadScopeForRole({ role, userId: 'u1' }), {}, role);
  assert.equal(canEditLead('agent', { assignedTo: 'u1' }, 'u1'), true);
  assert.equal(canEditLead('agent', { assignedTo: 'u2' }, 'u1'), false);
  assert.equal(canEditLead('agent', { assignedTo: null }, 'u1'), false);
  assert.equal(canMoveLead('agent', { assignedTo: 'u2' }, 'u1'), false);
  assert.equal(canEditLead('viewer', { assignedTo: 'u1' }, 'u1'), false);
  assert.equal(canMoveLead('viewer', { assignedTo: 'u1' }, 'u1'), false);
  for (const key of ['LEADS_VIEW_ALL', 'KANBAN_VIEW_ALL', 'REPORTS_VIEW_ALL', 'PURCHASES_VIEW_ALL', 'DASHBOARD_VIEW_ALL'] as PermissionKey[]) {
    assert.equal(can('agent', key), false, key);
  }
});

test('ninguém promove alguém a Dono nem gerencia um perfil igual ou acima do seu', () => {
  for (const role of ROLES) assert.equal(canManageRole(role, 'owner'), false, role);
  assert.deepEqual(ROLES.filter((target) => canManageRole('owner', target)), ['admin', 'manager', 'agent', 'viewer']);
  assert.deepEqual(ROLES.filter((target) => canManageRole('admin', target)), ['manager', 'agent', 'viewer']);
  for (const role of ['manager', 'agent', 'viewer']) assert.deepEqual(ROLES.filter((target) => canManageRole(role, target)), [], role);
  assert.equal(canManageRole(null, 'admin'), false);
  assert.equal(canManageRole('owner', 'owner', 'platform_admin'), true);
});

test('perfil desconhecido não tem nenhuma permissão', () => {
  for (const key of Object.keys(PERMISSIONS) as PermissionKey[]) {
    assert.equal(can('', key), false, key);
    assert.equal(can('platform_admin', key), false, key);
    assert.equal(can('OWNER', key), false, key);
  }
});
