import assert from 'node:assert/strict';
import test from 'node:test';

import { parseLeadBasicInfo } from '../lib/leads/basic-info';

test('nome e e-mail podem ser editados', () => {
  assert.deepEqual(parseLeadBasicInfo({ name: '  Eunice   Souza ', email: ' Eunice@Email.com ' }),
    { ok: true, data: { name: 'Eunice Souza', email: 'eunice@email.com' } });
  assert.deepEqual(parseLeadBasicInfo({ email: '' }), { ok: true, data: { email: null } });
  assert.deepEqual(parseLeadBasicInfo({}), { ok: true, data: {} });
});

test('nome vazio ou e-mail inválido não são salvos', () => {
  assert.equal(parseLeadBasicInfo({ name: ' ' }).ok, false);
  assert.equal(parseLeadBasicInfo({ name: 'x'.repeat(161) }).ok, false);
  assert.equal(parseLeadBasicInfo({ email: 'eunice@' }).ok, false);
});

test('o telefone nunca entra na edição', () => {
  const result = parseLeadBasicInfo({ name: 'Ana', phone: '5586999999999' } as never);
  assert.deepEqual(result, { ok: true, data: { name: 'Ana' } });
});
