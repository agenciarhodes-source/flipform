import assert from 'node:assert/strict';
import test from 'node:test';

import { contractDate, contractLinkMessage, createDocBody, signUrlFrom, zapSignPhone } from '../lib/contracts/zapsign-rules';

test('o corpo do ZapSign preenche só o que o FlipForm sabe e deixa o resto para o cliente', () => {
  const body = createDocBody({
    templateId: 'tpl-1',
    contractId: 'c-1',
    customer: { name: 'Maria da Silva', phone: '5586999418464', city: 'Picos', state: null },
    thesis: 'Salário-maternidade rural',
    companyName: 'Escritório X',
    now: new Date('2026-11-10T15:00:00Z'),
  });
  assert.equal(body.template_id, 'tpl-1');
  assert.equal(body.external_id, 'c-1');
  assert.equal(body.signer_name, 'Maria da Silva');
  assert.equal(body.signer_phone_country, '55');
  assert.equal(body.signer_phone_number, '86999418464');
  assert.equal(body.signer_has_incomplete_fields, true);
  assert.equal(body.send_automatic_whatsapp, false);
  const filled = Object.fromEntries(body.data.map((item) => [item.de, item.para]));
  assert.equal(filled['{{NOME COMPLETO}}'], 'Maria da Silva');
  assert.equal(filled['{{TESE}}'], 'Salário-maternidade rural');
  assert.equal(filled['{{DATA}}'], '10 de novembro de 2026');
  // Empty values (state) are not sent: the customer fills them.
  assert.equal('{{ESTADO}}' in filled, false);
  // CPF and address are never filled by FlipForm.
  assert.equal(body.data.some((item) => /CPF|ENDERE/.test(item.de)), false);
});

test('telefone só vai quando é brasileiro', () => {
  assert.deepEqual(zapSignPhone('5586999418464'), { country: '55', number: '86999418464' });
  assert.equal(zapSignPhone('+1 415 555 0100'), null);
  assert.equal(zapSignPhone(null), null);
});

test('a resposta do ZapSign dá o link de assinatura; resposta estranha não', () => {
  assert.deepEqual(signUrlFrom({ token: 'doc-1', signers: [{ sign_url: 'https://app.zapsign.com.br/verificar/s1' }] }),
    { docToken: 'doc-1', signUrl: 'https://app.zapsign.com.br/verificar/s1' });
  assert.equal(signUrlFrom({ token: 'doc-1', signers: [] }), null);
  assert.equal(signUrlFrom({ token: 'doc-1', signers: [{ sign_url: 'javascript:alert(1)' }] }), null);
  assert.equal(signUrlFrom(null), null);
});

test('a mensagem tem o link e explica o que o cliente faz', () => {
  const text = contractLinkMessage('Maria', 'https://app.zapsign.com.br/verificar/s1');
  assert.match(text, /^Maria, a sua documentação está completa/);
  assert.match(text, /https:\/\/app\.zapsign\.com\.br\/verificar\/s1/);
  assert.match(text, /CPF e endereço/);
  assert.equal(contractDate(new Date('2026-01-01T02:00:00Z')), '31 de dezembro de 2025');
});
