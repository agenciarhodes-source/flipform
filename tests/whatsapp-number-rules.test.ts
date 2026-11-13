import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanNumberLabel, numberDisplayName, pickConversationNumber } from '../lib/meta/whatsapp-number-rules';

const trafego = { id: 'n-trafego' };
const carteira = { id: 'n-carteira' };

test('a company with one number answers every conversation through it (as before)', () => {
  assert.deepEqual(pickConversationNumber({ conversationNumberId: null, connected: [carteira] }), { kind: 'ok', connection: carteira });
  // Reconnected number (new row): the old conversations keep being answered.
  assert.deepEqual(pickConversationNumber({ conversationNumberId: 'old-row', connected: [carteira] }), { kind: 'ok', connection: carteira });
});

test('several numbers: a conversation is answered by the number it came through', () => {
  assert.deepEqual(pickConversationNumber({ conversationNumberId: 'n-trafego', connected: [carteira, trafego] }), { kind: 'ok', connection: trafego });
  assert.deepEqual(pickConversationNumber({ conversationNumberId: 'n-carteira', connected: [carteira, trafego] }), { kind: 'ok', connection: carteira });
});

test('several numbers: never answered from another number when its own is disconnected', () => {
  assert.deepEqual(pickConversationNumber({ conversationNumberId: 'n-gone', connected: [carteira, trafego] }), { kind: 'number_disconnected' });
  assert.deepEqual(pickConversationNumber({ conversationNumberId: 'n-trafego', connected: [] }), { kind: 'not_connected' });
});

test('number names', () => {
  assert.equal(numberDisplayName({ label: 'Tráfego pago', displayPhoneNumber: '+55 86 99999-0000' }), 'Tráfego pago · +55 86 99999-0000');
  assert.equal(numberDisplayName({ label: null, displayPhoneNumber: '+55 86 99999-0000' }), '+55 86 99999-0000');
  assert.equal(numberDisplayName({}), 'WhatsApp');
  assert.equal(cleanNumberLabel('  Carteira   de  clientes '), 'Carteira de clientes');
  assert.equal(cleanNumberLabel(''), null);
  assert.equal(cleanNumberLabel('x'.repeat(60))?.length, 40);
});
