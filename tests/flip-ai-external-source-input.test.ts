import assert from 'node:assert/strict';
import test from 'node:test';

import { domainFromPastedLink } from '../lib/flip-ai/external-source-input';

test('link colado vira só o domínio', () => {
  assert.equal(domainFromPastedLink('https://www.gov.br/inss/pt-br'), 'www.gov.br');
  assert.equal(domainFromPastedLink('www.gov.br/inss/pt-br'), 'www.gov.br');
  assert.equal(domainFromPastedLink(' HTTP://WWW.Planalto.gov.br/ccivil_03/leis/l8213cons.htm '), 'www.planalto.gov.br');
  assert.equal(domainFromPastedLink('www.gov.br?x=1'), 'www.gov.br');
  assert.equal(domainFromPastedLink('www.gov.br'), 'www.gov.br');
});

test('o que não é caminho continua como digitado, para o servidor recusar', () => {
  assert.equal(domainFromPastedLink('*.empresa.com.br'), '*.empresa.com.br');
  assert.equal(domainFromPastedLink('empresa.com.br:443/x'), 'empresa.com.br:443');
  assert.equal(domainFromPastedLink('https://user@empresa.com.br/'), 'user@empresa.com.br');
});
