import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contractFixMessage, contractReminderMessage, gojusTask, shouldRemindUnsigned, signedThanksMessage, zapSignDocState,
  zapSignEvent, zapSignWebhookAuthorized, zapSignWebhookSecret,
} from '../lib/contracts/zapsign-signed-rules';

test('o aviso do ZapSign só entra com o segredo da empresa', () => {
  const secret = zapSignWebhookSecret('chave-de-teste-bem-longa', 'tenant-a');
  assert.notEqual(secret, zapSignWebhookSecret('chave-de-teste-bem-longa', 'tenant-b'));
  assert.equal(zapSignWebhookAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(zapSignWebhookAuthorized('Bearer errado', secret), false);
  assert.equal(zapSignWebhookAuthorized(null, secret), false);
});

test('do evento só vale o token do documento; o estado vem do ZapSign de novo', () => {
  assert.deepEqual(zapSignEvent({ event_type: 'doc_signed', token: 'cce11abf-abcd-abcd-a657-25b55f185f16', status: 'signed' }),
    { type: 'doc_signed', docToken: 'cce11abf-abcd-abcd-a657-25b55f185f16' });
  assert.equal(zapSignEvent({ event_type: 'doc_signed', token: '../../x' }), null);
  assert.deepEqual(zapSignDocState({ status: 'signed', signed_file: 'https://s3/x.pdf', signers: [{ status: 'signed' }] }),
    { status: 'signed', signedFile: 'https://s3/x.pdf', refused: false });
  assert.equal(zapSignDocState({ status: 'pending', signers: [{ status: 'refused' }] })?.refused, true);
  assert.equal(zapSignDocState({ status: 'signed', signed_file: 'http://inseguro' })?.signedFile, null);
});

test('mensagens ao cliente: obrigada, o que faltou e o lembrete', () => {
  assert.match(signedThanksMessage('Maria'), /^Maria, recebemos o seu contrato assinado/);
  assert.match(signedThanksMessage('Maria'), /iremos examinar o seu caso a partir dos documentos que você enviou/);
  const fix = contractFixMessage(null, ['O campo do endereço ficou em branco.']);
  assert.match(fix, /^Recebi o seu contrato/);
  assert.match(fix, /• O campo do endereço ficou em branco\./);
  assert.match(fix, /novo link/);
  assert.match(contractReminderMessage('Ana', 'https://app.zapsign.com.br/verificar/x'), /https:\/\/app\.zapsign\.com\.br\/verificar\/x/);
});

test('lembrete: uma vez, depois de 3 horas, só dentro das 24 horas do WhatsApp', () => {
  const now = new Date('2026-11-10T15:00:00Z');
  const hours = (h: number) => new Date(now.getTime() - h * 3_600_000);
  assert.equal(shouldRemindUnsigned({ sentAt: hours(4), now, lastInboundAt: hours(5), reminded: false }), true);
  assert.equal(shouldRemindUnsigned({ sentAt: hours(2), now, lastInboundAt: hours(3), reminded: false }), false);
  assert.equal(shouldRemindUnsigned({ sentAt: hours(4), now, lastInboundAt: hours(24), reminded: false }), false);
  assert.equal(shouldRemindUnsigned({ sentAt: hours(4), now, lastInboundAt: hours(5), reminded: true }), false);
});

test('a tarefa do Gojus tem prazo de 1 hora no texto e os links do lead e da conversa', () => {
  const task = gojusTask({ customerName: 'Maria', thesis: 'Rural', leadId: 'l1', conversationId: 'c1', appUrl: 'https://app.flipform.com.br' });
  assert.equal(task.title, 'Lançar no Gojus: Maria (Rural)');
  assert.match(task.description, /em até 1 hora/);
  assert.match(task.description, /leads\?leadId=l1/);
  assert.match(task.description, /inbox\?conversationId=c1/);
});
