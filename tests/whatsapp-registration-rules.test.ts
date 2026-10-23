import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registrationFirstName,
  registrationNameState,
  registrationNote,
  registrationWhen,
} from '../lib/whatsapp-ai/registration-rules';

test('o primeiro nome do cadastro sai escrito normalmente', () => {
  assert.equal(registrationFirstName('LUIZA BEATRIZ ARAUJO DE CARVALHO'), 'Luiza');
  assert.equal(registrationFirstName('  ana karoline '), 'Ana');
  assert.equal(registrationFirstName('50092 Kativanilda'), 'Kativanilda');
  assert.equal(registrationFirstName(''), null);
  assert.equal(registrationFirstName(null), null);
});

test('a data do cadastro segue o horário de Brasília', () => {
  const now = new Date('2026-10-23T18:00:00Z');
  assert.equal(registrationWhen(new Date('2026-10-23T12:00:00Z'), now), 'hoje');
  // 01:00 UTC do dia 23 ainda é dia 22 em Brasília.
  assert.equal(registrationWhen(new Date('2026-10-23T01:00:00Z'), now), 'ontem');
  assert.equal(registrationWhen(new Date('2026-10-09T15:00:00Z'), now), 'no dia 09/10/2026');
});

test('a primeira resposta cita o cadastro no formulário da empresa', () => {
  const note = registrationNote({
    companyName: 'Escritório Exemplo',
    registeredAt: new Date('2026-10-09T15:00:00Z'),
    now: new Date('2026-10-23T18:00:00Z'),
  });
  assert.match(note, /recebeu o contato dela pelo cadastro que ela fez no dia 09\/10\/2026 no formulário de Escritório Exemplo/);
});

test('o nome do cadastro é confirmado uma vez, na primeira resposta', () => {
  assert.deepEqual(
    registrationNameState({ registeredName: 'LUIZA BEATRIZ', preferredName: null, aiRepliesSoFar: 0 }),
    { knownName: null, nameToConfirm: 'Luiza' },
  );
  // Sem resposta, a conversa segue com o nome do cadastro, sem perguntar de novo.
  assert.deepEqual(
    registrationNameState({ registeredName: 'LUIZA BEATRIZ', preferredName: null, aiRepliesSoFar: 2 }),
    { knownName: 'Luiza', nameToConfirm: 'Luiza' },
  );
  // O nome que a pessoa disse vale mais que o do cadastro.
  assert.equal(
    registrationNameState({ registeredName: 'LUIZA BEATRIZ', preferredName: 'Bia', aiRepliesSoFar: 2 }).knownName,
    'Bia',
  );
});
