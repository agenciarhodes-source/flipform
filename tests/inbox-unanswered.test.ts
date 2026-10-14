import assert from 'node:assert/strict';
import test from 'node:test';

import { isWaitingForAnswer } from '../lib/inbox/unanswered';

const now = new Date('2026-10-14T20:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

test('a pessoa escreveu por último e esperou 15 minutos ou mais', () => {
  assert.equal(isWaitingForAnswer({ lastInboundAt: minutesAgo(20), lastOutboundAt: minutesAgo(60), status: 'open', now }), true);
  assert.equal(isWaitingForAnswer({ lastInboundAt: minutesAgo(15), lastOutboundAt: null, status: 'open', now }), true);
});

test('não avisa quando já respondida, cedo demais, resolvida ou antiga demais', () => {
  assert.equal(isWaitingForAnswer({ lastInboundAt: minutesAgo(20), lastOutboundAt: minutesAgo(5), status: 'open', now }), false);
  assert.equal(isWaitingForAnswer({ lastInboundAt: minutesAgo(10), lastOutboundAt: null, status: 'open', now }), false);
  assert.equal(isWaitingForAnswer({ lastInboundAt: minutesAgo(30), lastOutboundAt: null, status: 'resolved', now }), false);
  assert.equal(isWaitingForAnswer({ lastInboundAt: minutesAgo(25 * 60), lastOutboundAt: null, status: 'open', now }), false);
  assert.equal(isWaitingForAnswer({ lastInboundAt: null, lastOutboundAt: null, status: 'open', now }), false);
});
