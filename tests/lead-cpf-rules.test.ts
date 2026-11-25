import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCpfInText, formatCpf, isValidCpf, maskCpf, normalizeCpf, redactCpfText, redactCpfPayload } from '../lib/leads/cpf-rules';
const valid = '52998224725';
test('valid check digits, mask, format and rejection of malformed values', () => {
  assert.equal(isValidCpf(valid),true); assert.equal(isValidCpf('529.982.247-24'),false);
  assert.equal(isValidCpf('11111111111'),false); assert.equal(normalizeCpf('abc'+valid),null);
  assert.equal(formatCpf(valid),'529.982.247-25'); assert.equal(maskCpf(valid),'***.982.247-**');
});
test('phone not mistaken for CPF; ambiguous identifiers rejected', () => {
  assert.equal(findCpfInText('telefone '+valid),null);
  assert.equal(findCpfInText('meu CPF é '+valid),valid);
  assert.equal(findCpfInText('529.982.247-25'),valid);
  assert.equal(findCpfInText('529.982.247-25 e 111.444.777-35'),null);
  assert.equal(redactCpfText('CPF '+valid),'CPF [CPF ocultado]');
});

test('redacts CPF from nested model output, keeping unrelated data', () => {
  const data = { reply: 'CPF '+valid, memoryPatch: { facts: ['529.982.247-25'] }, qualification: { score: 90, summary: valid }, flag: true };
  assert.deepEqual(redactCpfPayload(data), { reply: 'CPF [CPF ocultado]', memoryPatch: { facts: ['[CPF ocultado]'] }, qualification: { score: 90, summary: '[CPF ocultado]' }, flag: true });
  assert.equal(data.qualification.summary, valid);
});
