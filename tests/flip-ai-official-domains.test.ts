import assert from 'node:assert/strict';
import test from 'node:test';

import { isHostAllowed, officialRoot, searchFilterDomains } from '../lib/flip-ai/official-domains';

test('subdomínios oficiais do governo são aceitos a partir de um domínio cadastrado', () => {
  const domains = ['www.gov.br', 'www.planalto.gov.br', 'portal.stf.jus.br', 'www.consumidor.gov.br'];
  assert.equal(isHostAllowed('servicos.inss.gov.br', domains), true);
  assert.equal(isHostAllowed('www.gov.br', domains), true);
  assert.equal(isHostAllowed('www.stj.jus.br', domains), true);
  assert.equal(officialRoot('www.gov.br'), 'gov.br');
  assert.deepEqual(searchFilterDomains(domains), ['gov.br', 'jus.br']);
});

test('domínios comuns continuam com correspondência exata', () => {
  const domains = ['www.oab.org.br', 'junqueiraadvogados.com', 'github.io'];
  assert.equal(isHostAllowed('www.oab.org.br', domains), true);
  assert.equal(isHostAllowed('evil.oab.org.br', domains), false);
  assert.equal(isHostAllowed('attacker.github.io', domains), false);
  assert.equal(isHostAllowed('evilgov.br', ['www.gov.br']), false);
  assert.deepEqual(searchFilterDomains(['www.oab.org.br']), ['www.oab.org.br']);
});
