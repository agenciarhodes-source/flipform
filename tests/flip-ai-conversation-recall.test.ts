import assert from 'node:assert/strict';
import test from 'node:test';

import { contactDataGiven, contactGivenNote, groupConsecutiveTurns } from '../lib/flip-ai/conversation-recall';

test('mensagens seguidas do mesmo lado viram um bloco só', () => {
  const grouped = groupConsecutiveTurns([
    { id: '1', role: 'user', content: 'Bom dia' },
    { id: '2', role: 'user', content: 'Quando vão entrar em contato' },
    { id: '3', role: 'user', content: 'To a dias tentando' },
    { id: '4', role: 'assistant', content: 'Olá!' },
    { id: '5', role: 'user', content: 'Esse número não fala' },
  ]);
  assert.equal(grouped.length, 3);
  assert.deepEqual(grouped[0], { id: '3', role: 'user', content: 'Bom dia\nQuando vão entrar em contato\nTo a dias tentando' });
  assert.equal(grouped[2].content, 'Esse número não fala');
});

test('reconhece telefone e CPF já enviados, em vários formatos', () => {
  assert.deepEqual(contactDataGiven(['031.783.882-22', 'Alice', '68 992503947']), { phone: true, document: true });
  assert.deepEqual(contactDataGiven(['(86) 99941-8464']), { phone: true, document: false });
  assert.deepEqual(contactDataGiven(['5586999418464']), { phone: true, document: false });
  assert.deepEqual(contactDataGiven(['03178388222']), { phone: false, document: true });
});

test('não confunde valores, datas ou número de processo com contato', () => {
  assert.deepEqual(contactDataGiven(['vou ter que pagar 10 %', 'R$ 1.500,00', 'dia 09/11/2026', '0801234-56.2024.8.18.0140']), { phone: false, document: false });
});

test('a nota só aparece quando há dado enviado', () => {
  assert.equal(contactGivenNote({ phone: false, document: false }), '');
  const note = contactGivenNote({ phone: true, document: true });
  assert.match(note, /telefone e CPF/);
  assert.match(note, /NÃO peça esses dados de novo/);
});
