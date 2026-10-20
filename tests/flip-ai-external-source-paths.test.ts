import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExternalPathRules,
  ExternalSourcePathError,
  normalizeExternalSourcePaths,
  pathAllowed,
  pathFromPastedLink,
} from '../lib/flip-ai/external-source-paths';

test('link colado vira o caminho da página', () => {
  assert.equal(pathFromPastedLink('https://www.gov.br/inss/pt-br'), '/inss/pt-br');
  assert.equal(pathFromPastedLink('www.gov.br/inss/pt-br/'), '/inss/pt-br');
  assert.equal(pathFromPastedLink('https://www.gov.br'), '');
  assert.equal(pathFromPastedLink('https://www.gov.br/'), '');
});

test('caminhos digitados ou colados são limpos e conferidos com o domínio', () => {
  assert.equal(normalizeExternalSourcePaths('https://www.gov.br/inss/pt-br', 'www.gov.br'), '/inss/pt-br');
  assert.equal(normalizeExternalSourcePaths('/inss/pt-br/, /mds/pt-br', 'www.gov.br'), '/inss/pt-br\n/mds/pt-br');
  assert.equal(normalizeExternalSourcePaths('/inss/pt-br\n/inss/pt-br', 'www.gov.br'), '/inss/pt-br');
  assert.equal(normalizeExternalSourcePaths('', 'www.gov.br'), null);
  assert.equal(normalizeExternalSourcePaths('/', 'www.gov.br'), null);
  assert.throws(() => normalizeExternalSourcePaths('https://outro.com.br/x', 'www.gov.br'), ExternalSourcePathError);
  assert.throws(() => normalizeExternalSourcePaths('/inss/../admin', 'www.gov.br'), ExternalSourcePathError);
  assert.throws(() => normalizeExternalSourcePaths('/inss/*', 'www.gov.br'), ExternalSourcePathError);
});

test('só páginas dentro do caminho são aceitas', () => {
  assert.equal(pathAllowed('/inss/pt-br/direitos-e-deveres/salario-maternidade', ['/inss/pt-br']), true);
  assert.equal(pathAllowed('/inss/pt-br', ['/inss/pt-br']), true);
  assert.equal(pathAllowed('/INSS/pt-br/x', ['/inss/pt-br']), true);
  assert.equal(pathAllowed('/inss/pt-brasil', ['/inss/pt-br']), false);
  assert.equal(pathAllowed('/mds/pt-br', ['/inss/pt-br']), false);
  assert.equal(pathAllowed('/qualquer', null), true);
  assert.equal(pathAllowed('/qualquer', []), true);
});

test('uma fonte sem caminho libera o site inteiro', () => {
  const limited = buildExternalPathRules([
    { domain: 'www.gov.br', pathPrefix: '/inss/pt-br' },
    { domain: 'www.planalto.gov.br', pathPrefix: null },
  ]);
  assert.deepEqual(limited.get('www.gov.br'), ['/inss/pt-br']);
  assert.equal(limited.get('www.planalto.gov.br'), null);
  const open = buildExternalPathRules([
    { domain: 'www.gov.br', pathPrefix: '/inss/pt-br' },
    { domain: 'www.gov.br', pathPrefix: null },
  ]);
  assert.equal(open.get('www.gov.br'), null);
});
