import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMetaJson, readInstagramProfile } from '../lib/meta/instagram';

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

test('IDs grandes da Meta chegam sem perder dígitos', () => {
  const answer = parseMetaJson('{"access_token":"x","user_id":17841405793187218,"permissions":"a,b"}');
  assert.equal(answer.user_id, '17841405793187218');
  assert.equal(parseMetaJson('{"ids":[17841405793187218, 12]}').ids[0], '17841405793187218');
  assert.equal(parseMetaJson('{"expires_in":5183944}').expires_in, 5183944);
  assert.deepEqual(parseMetaJson(''), {});
});
