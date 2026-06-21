import assert from 'node:assert/strict';
import {
  cleanOptions,
  isValidBrazilMobilePhone,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  normalizeBrazilPhone,
  normalizeCnpj,
  normalizeCpf,
  normalizeEmail,
} from '../lib/form-field-validation';

assert.equal(normalizeBrazilPhone('+55 (86) 9 9999-9999'), '5586999999999');
assert.equal(isValidBrazilMobilePhone('+55 (86) 9 9999-9999'), true);
assert.equal(isValidBrazilMobilePhone('55869999999'), false);
assert.equal(isValidBrazilMobilePhone('558699999999'), false);
assert.equal(isValidBrazilMobilePhone('5586888888888'), false);
assert.equal(isValidBrazilMobilePhone('+55 (86) 9 abcd-9999'), false);
assert.equal(isValidBrazilMobilePhone('abc'), false);

assert.equal(normalizeCpf('529.982.247-25'), '52998224725');
assert.equal(isValidCpf('529.982.247-25'), true);
assert.equal(isValidCpf('5299822472'), false);
assert.equal(isValidCpf('000.000.000-00'), false);

assert.equal(normalizeCnpj('11.222.333/0001-81'), '11222333000181');
assert.equal(isValidCnpj('11.222.333/0001-81'), true);
assert.equal(isValidCnpj('1122233300018'), false);
assert.equal(isValidCnpj('00.000.000/0000-00'), false);

assert.equal(normalizeEmail(' Contato@Empresa.Com.Br '), 'contato@empresa.com.br');
assert.equal(isValidEmail('cliente@gmail.com'), true);
assert.equal(isValidEmail('contato@empresa.com.br'), true);
assert.equal(isValidEmail('cliente'), false);
assert.equal(isValidEmail('cliente@gmail'), false);
assert.equal(isValidEmail('cliente gmail.com'), false);

assert.deepEqual(cleanOptions('Sim\nNão\nSim\n\nTalvez'), ['Sim', 'Não', 'Talvez']);

console.log('form-field-validation tests passed');
