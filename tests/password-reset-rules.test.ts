import assert from 'node:assert/strict';
import test from 'node:test';

import { companyMayResetPassword, passwordResetSchema } from '../lib/password-reset-rules';

const base = { isSelf: false, targetIsPlatformAdmin: false, targetRole: 'manager', canManageTargetRole: true, targetCompanies: 1 };

test('a empresa troca a senha só de quem usa só ela e que ela pode gerenciar', () => {
  assert.deepEqual(companyMayResetPassword(base), { ok: true });
  assert.equal(companyMayResetPassword({ ...base, targetCompanies: 2 }).ok, false);
  assert.equal(companyMayResetPassword({ ...base, targetRole: 'owner' }).ok, false);
  assert.equal(companyMayResetPassword({ ...base, canManageTargetRole: false }).ok, false);
  assert.equal(companyMayResetPassword({ ...base, isSelf: true }).ok, false);
  assert.equal(companyMayResetPassword({ ...base, targetIsPlatformAdmin: true }).ok, false);
});

test('a senha nova tem no mínimo 8 caracteres e precisa ser repetida igual', () => {
  assert.equal(passwordResetSchema.safeParse({ newPassword: 'curta', confirmNewPassword: 'curta' }).success, false);
  assert.equal(passwordResetSchema.safeParse({ newPassword: 'umaSenhaBoa1', confirmNewPassword: 'outraSenha1' }).success, false);
  assert.equal(passwordResetSchema.safeParse({ newPassword: 'umaSenhaBoa1', confirmNewPassword: 'umaSenhaBoa1' }).success, true);
  assert.equal(passwordResetSchema.safeParse({ newPassword: 'umaSenhaBoa1', confirmNewPassword: 'umaSenhaBoa1', extra: 1 }).success, false);
});
