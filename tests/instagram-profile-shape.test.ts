import assert from 'node:assert/strict';
import test from 'node:test';

import { readInstagramProfile } from '../lib/meta/instagram';

test('lê o perfil no formato atual da Meta ({ data: [ ... ] })', () => {
  assert.deepEqual(readInstagramProfile({ data: [{ user_id: '17841400000000001', username: 'iigdpiaui', id: '9000000000000001' }] }), {
    professionalId: '17841400000000001', appScopedId: '9000000000000001', username: 'iigdpiaui',
  });
});

test('ainda lê o formato antigo ({ id, username })', () => {
  assert.deepEqual(readInstagramProfile({ id: 123, username: 'conta' }), { professionalId: '123', appScopedId: '123', username: 'conta' });
});

test('sem conta ou sem @, nada é inventado', () => {
  assert.deepEqual(readInstagramProfile({ data: [] }), { professionalId: null, appScopedId: null, username: null });
  assert.deepEqual(readInstagramProfile({}), { professionalId: null, appScopedId: null, username: null });
  assert.equal(readInstagramProfile({ data: [{ user_id: '1', username: '  ' }] }).username, null);
});
