import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionBlock, correctionText, isCorrectionText } from '../lib/inbox/correction-rules';

const now = new Date('2026-11-11T15:00:00Z');
const team = { direction: 'outbound', channel: 'whatsapp', type: 'text', status: 'delivered', sentByUserId: 'u1', providerMessageId: 'wamid.1' };
const base = { message: team, lastInboundAt: new Date('2026-11-11T10:00:00Z'), requesterId: 'u1', requesterRole: 'agent', now };

test('the team can correct its own WhatsApp text messages within 24 hours', () => {
  assert.equal(correctionBlock(base), null);
  assert.equal(correctionBlock({ ...base, requesterId: 'u2', requesterRole: 'manager' }), null);
});

test('AI, customer, failed, non-text, other channel, other person and closed window are refused', () => {
  assert.match(correctionBlock({ ...base, message: { ...team, sentByUserId: null } })!, /enviadas pela equipe/);
  assert.match(correctionBlock({ ...base, message: { ...team, direction: 'inbound' } })!, /enviadas pela equipe/);
  assert.match(correctionBlock({ ...base, message: { ...team, status: 'failed' } })!, /não foi entregue/);
  assert.match(correctionBlock({ ...base, message: { ...team, providerMessageId: null } })!, /não foi entregue/);
  assert.match(correctionBlock({ ...base, message: { ...team, type: 'audio' } })!, /texto/);
  assert.match(correctionBlock({ ...base, message: { ...team, channel: 'instagram' } })!, /WhatsApp/);
  assert.match(correctionBlock({ ...base, requesterId: 'u2' })!, /suas próprias/);
  assert.match(correctionBlock({ ...base, lastInboundAt: new Date('2026-11-10T14:00:00Z') })!, /24 horas/);
});

test('the correction text', () => {
  assert.equal(correctionText(' Amanhã às 10h '), '✏️ *Correção:* Amanhã às 10h');
  assert.equal(isCorrectionText('✏️ *Correção:* Amanhã às 10h'), true);
  assert.equal(isCorrectionText('Amanhã às 10h'), false);
});
