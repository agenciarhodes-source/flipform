import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answerDisplayText,
  CNPJ_PLACEHOLDER,
  CPF_PLACEHOLDER,
  isProtectedAnswer,
  maskCnpj,
  maskCpf,
  maskDocumentNumbers,
} from '../lib/privacy/documents';

// Valid check digits, generated for tests (not real people).
const CPF = '529.982.247-25';
const CNPJ = '11.222.333/0001-81';

test('CPF e CNPJ não vão para a IA; o resto do texto fica igual', () => {
  assert.equal(maskDocumentNumbers(`Meu CPF é ${CPF}, nome Maria`), `Meu CPF é ${CPF_PLACEHOLDER}, nome Maria`);
  assert.equal(maskDocumentNumbers('cpf 52998224725'), `cpf ${CPF_PLACEHOLDER}`);
  assert.equal(maskDocumentNumbers(`empresa ${CNPJ}`), `empresa ${CNPJ_PLACEHOLDER}`);
  assert.equal(maskDocumentNumbers('11222333000181'), CNPJ_PLACEHOLDER);
});

test('telefone, data e número qualquer não são confundidos com CPF', () => {
  assert.equal(maskDocumentNumbers('Meu celular é 86999206251'), 'Meu celular é 86999206251');
  assert.equal(maskDocumentNumbers('nasceu em 02/08/2026'), 'nasceu em 02/08/2026');
  assert.equal(maskDocumentNumbers('processo 123.456.789-00'), 'processo 123.456.789-00');
  assert.equal(maskDocumentNumbers('sem números'), 'sem números');
});

test('máscara para mostrar na tela', () => {
  assert.equal(maskCpf('52998224725'), '***.982.247-**');
  assert.equal(maskCnpj('11222333000181'), '**.222.333/0001-**');
});

test('resposta protegida aparece mascarada', () => {
  const answer = { protected: 'cpf', masked: '***.982.247-**', encrypted: 'v1:abc' };
  assert.equal(isProtectedAnswer(answer), true);
  assert.equal(answerDisplayText(answer), '***.982.247-**');
  assert.equal(answerDisplayText('texto'), 'texto');
  assert.equal(answerDisplayText(['a', 'b']), '["a","b"]');
  assert.equal(isProtectedAnswer({ protected: 'cpf', masked: 'x' }), false);
});
