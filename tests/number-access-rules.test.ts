import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_NUMBERS, mayUseNumber, numberMatch, numberScopeFor, numberScopeWhere } from '../lib/inbox/number-access-rules';

const trafego = 'n-trafego';
const carteira = 'n-carteira';

test('nobody is restricted by default; the owner always sees every number', () => {
  assert.deepEqual(numberScopeFor({ role: 'agent', markedNumberIds: [], legacyNumberId: carteira }), ALL_NUMBERS);
  assert.deepEqual(numberScopeFor({ role: 'owner', markedNumberIds: [trafego], legacyNumberId: carteira }), ALL_NUMBERS);
  assert.equal(numberScopeWhere(ALL_NUMBERS), null);
  assert.equal(numberScopeWhere(undefined), null);
});

test('a person marked on the walk-in number does not see the paid-traffic number', () => {
  const scope = numberScopeFor({ role: 'agent', markedNumberIds: [carteira], legacyNumberId: trafego });
  assert.equal(mayUseNumber(scope, { channel: 'whatsapp', whatsappConnectionId: carteira }), true);
  assert.equal(mayUseNumber(scope, { channel: 'whatsapp', whatsappConnectionId: trafego }), false);
  // A conversation from before several numbers belongs to the first number (here the traffic one).
  assert.equal(mayUseNumber(scope, { channel: 'whatsapp', whatsappConnectionId: null }), false);
  // Instagram is not affected.
  assert.equal(mayUseNumber(scope, { channel: 'instagram', whatsappConnectionId: null }), true);
});

test('a person marked on both numbers sees both, old conversations included', () => {
  const scope = numberScopeFor({ role: 'manager', markedNumberIds: [carteira, trafego, carteira], legacyNumberId: trafego });
  assert.deepEqual(scope.allowed, [carteira, trafego]);
  assert.equal(mayUseNumber(scope, { channel: 'whatsapp', whatsappConnectionId: null }), true);
  assert.deepEqual(numberScopeWhere(scope), {
    OR: [
      { channel: { not: 'whatsapp' } },
      { whatsappConnectionId: { in: [carteira, trafego] } },
      { whatsappConnectionId: null },
    ],
  });
});

test('the number filter includes old conversations only for the first number', () => {
  assert.deepEqual(numberMatch(trafego, trafego), { OR: [{ whatsappConnectionId: trafego }, { whatsappConnectionId: null }] });
  assert.deepEqual(numberMatch(carteira, trafego), { whatsappConnectionId: carteira });
});
