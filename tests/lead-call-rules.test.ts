import test from 'node:test';
import assert from 'node:assert/strict';
import { brazilianDigits, callSchema, callStoryText, dialHref, isCallTaskTitle, whatsappHref } from '../lib/leads/call-rules';
import { buildLeadStory } from '../lib/leads/lead-story-rules';

test('phone links: Brazilian numbers with or without the country code', () => {
  assert.equal(brazilianDigits('(86) 99926-6593'), '5586999266593');
  assert.equal(brazilianDigits('+55 86 99926-6593'), '5586999266593');
  assert.equal(brazilianDigits('8632221111'), '558632221111');
  assert.equal(brazilianDigits('123'), null);
  assert.equal(dialHref('86 99926-6593'), 'tel:+5586999266593');
  assert.equal(whatsappHref('86 99926-6593'), 'https://wa.me/5586999266593');
  assert.equal(dialHref(null), null);
});

test('call record: "call back later" needs a time; notes are limited', () => {
  assert.equal(callSchema.safeParse({ outcome: 'callback' }).success, false);
  assert.equal(callSchema.safeParse({ outcome: 'callback', callbackAt: '2026-11-12T13:00:00.000Z' }).success, true);
  assert.equal(callSchema.safeParse({ outcome: 'no_answer' }).success, true);
  assert.equal(callSchema.safeParse({ outcome: 'talvez' }).success, false);
  assert.equal(callSchema.safeParse({ outcome: 'answered', note: 'x'.repeat(1001) }).success, false);
});

test('call tasks and the summary line', () => {
  assert.equal(isCallTaskTitle('Ligar para Maria (sequência de retomada)'), true);
  assert.equal(isCallTaskTitle('Fazer a ligação de confirmação'), true);
  assert.equal(isCallTaskTitle('Conferir os documentos'), false);
  assert.equal(callStoryText({ outcome: 'no_answer', userName: 'Rebeca', note: null }), 'Ligação: não atendeu (Rebeca)');
  assert.equal(callStoryText({ outcome: 'answered', userName: null, note: 'vai mandar a carteira amanhã' }), 'Ligação: atendeu — vai mandar a carteira amanhã');
  const story = buildLeadStory({
    name: 'Ana', createdAt: new Date('2026-11-05T13:00:00Z'), source: null, assignedName: null, stageName: null, status: 'open',
    channels: [], documents: null, documentArrivals: [], stageMoves: [], tasks: [], events: [], lastInbound: null, lastOutboundAt: null,
    calls: [{ at: new Date('2026-11-06T13:00:00Z'), outcome: 'callback', userName: 'Monica', note: null }],
  });
  assert.ok(story.timeline.some((event) => event.text === 'Ligação: pediu para ligar depois (Monica)'));
});
