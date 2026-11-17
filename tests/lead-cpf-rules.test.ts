import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCpfInText, formatCpf, isValidCpf, maskCpf, normalizeCpf, validCpfOrNull } from '../lib/leads/cpf-rules';

// Valid test CPFs (generated, belong to no one): 529.982.247-25 and 111.444.777-35.
const A = '52998224725';
const B = '11144477735';

test('só CPF real: 11 dígitos, dígitos verificadores certos, nunca todos iguais', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf(B), true);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('1234567890'), false);
  assert.equal(normalizeCpf(' 529 982 247 25 '), A);
  assert.equal(validCpfOrNull('abc'), null);
});

test('formato e máscara', () => {
  assert.equal(formatCpf(A), '529.982.247-25');
  assert.equal(maskCpf(A), '***.982.247-**');
});

test('acha o CPF escrito na conversa, sem confundir com telefone', () => {
  assert.equal(findCpfInText('meu cpf é 529.982.247-25 ok'), A);
  assert.equal(findCpfInText('CPF 11144477735'), B);
  assert.equal(findCpfInText('cpf: 111 444 777 35'), B);
  // 11 dígitos soltos sem falar de CPF: pode ser telefone, não pega.
  assert.equal(findCpfInText('meu número 11144477735'), null);
  assert.equal(findCpfInText('cpf 529.982.247-24'), null);
  assert.equal(findCpfInText(null), null);
});
