import assert from 'node:assert/strict';
import test from 'node:test';

import { askedForName, clearFirstName, nameQuestion } from '../lib/whatsapp-ai/name-clarity';
import { registrationNameState } from '../lib/whatsapp-ai/registration-rules';

test('nomes claros viram o primeiro nome, escrito normalmente', () => {
  for (const [input, expected] of [
    ['Dalila de Jesus santos', 'Dalila'], ['LUIZA BEATRIZ', 'Luiza'], ['JOÃO', 'João'], ['RITA', 'Rita'],
    ['Ana', 'Ana'], ['ANA PAULA', 'Ana'], ['Eva', 'Eva'], ['Léo', 'Léo'], ['Dona Maria', 'Maria'],
    ['Dr. Paulo Silva', 'Paulo'], ['Christian', 'Christian'], ['Wesley 🙏', 'Wesley'], ['Thaynara', 'Thaynara'],
  ] as const) {
    assert.equal(clearFirstName(input), expected, input);
  }
});

test('abreviações, palavras comuns e nomes de empresa não são tratados como nome', () => {
  for (const input of [
    'Rf', 'RF', 'JR', 'A', 'M.', 'Mãe', 'Amor', 'Vendas', 'Loja Bela Moda', 'Cliente', 'Deus é fiel', 'Advogado',
    'Kkkk', 'Xbtrk', '🙏🙏', '123', '', null, undefined, 'Sim', 'Ok', 'Contato', 'Oficial', 'LTDA',
  ]) {
    assert.equal(clearFirstName(input), null, String(input));
  }
});

test('a pergunta do nome depende de o nome ser claro', () => {
  assert.equal(nameQuestion('Rafaela Souza'), '"Posso te chamar de Rafaela?"');
  assert.equal(nameQuestion('Rf'), '"Como posso te chamar?"');
  assert.equal(nameQuestion('Mãe ❤️'), '"Como posso te chamar?"');
  assert.equal(nameQuestion(null), '"Como posso te chamar?"');
});

test('reconhece quando a IA já perguntou o nome', () => {
  assert.equal(askedForName(['Oi! Posso te chamar de Ana?']), true);
  assert.equal(askedForName(['Claro. Como posso te chamar?']), true);
  assert.equal(askedForName(['Como você prefere ser chamada?']), true);
  assert.equal(askedForName(['Você já teve o bebê?', null]), false);
});

test('cadastro com nome que não é claro: a IA não passa a usar esse nome sozinha', () => {
  assert.deepEqual(registrationNameState({ registeredName: 'Rf', preferredName: null, aiRepliesSoFar: 2 }).knownName, null);
  assert.equal(registrationNameState({ registeredName: 'LUIZA BEATRIZ', preferredName: null, aiRepliesSoFar: 2 }).knownName, 'Luiza');
  assert.equal(registrationNameState({ registeredName: 'Rf', preferredName: 'Rafaela', aiRepliesSoFar: 2 }).knownName, 'Rafaela');
});
