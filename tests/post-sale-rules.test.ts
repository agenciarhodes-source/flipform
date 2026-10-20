import assert from 'node:assert/strict';
import test from 'node:test';

import { isOptOutMessage, isWithinSendingHours, nextPostSaleMessage, parseTemplateRef } from '../lib/post-sale/rules';

const DAY = 86_400_000;
const now = new Date('2026-10-21T15:00:00Z'); // quarta, 12h em Brasília
const settings = { progress: { enabled: true, intervalDays: 30 }, review: { enabled: true, afterDays: 15 } };
const none = { lastAnySendAt: null, lastProgressAt: null, reviewSentAt: null };

test('SAIR e parecidos param as mensagens automáticas', () => {
  for (const text of ['SAIR', ' sair ', 'Parar', 'não quero', 'NAO QUERO MAIS', 'Stop']) assert.equal(isOptOutMessage(text), true, text);
  for (const text of ['quero sair do processo?', 'ok', '', null]) assert.equal(isOptOutMessage(text), false, String(text));
});

test('só envia de segunda a sábado, das 9h às 19h de Brasília', () => {
  assert.equal(isWithinSendingHours(now), true);
  assert.equal(isWithinSendingHours(new Date('2026-10-21T23:00:00Z')), false); // 20h
  assert.equal(isWithinSendingHours(new Date('2026-10-25T15:00:00Z')), false); // domingo
});

test('avaliação depois dos dias escolhidos, uma vez; andamento no intervalo', () => {
  assert.equal(nextPostSaleMessage({ wonAt: new Date(now.getTime() - 10 * DAY), now, history: none, ...settings }), null);
  assert.equal(nextPostSaleMessage({ wonAt: new Date(now.getTime() - 16 * DAY), now, history: none, ...settings }), 'review');
  const reviewed = { lastAnySendAt: new Date(now.getTime() - 20 * DAY), lastProgressAt: null, reviewSentAt: new Date(now.getTime() - 20 * DAY) };
  assert.equal(nextPostSaleMessage({ wonAt: new Date(now.getTime() - 40 * DAY), now, history: reviewed, ...settings }), 'progress');
});

test('nunca duas mensagens automáticas na mesma semana', () => {
  const recent = { lastAnySendAt: new Date(now.getTime() - 3 * DAY), lastProgressAt: null, reviewSentAt: null };
  assert.equal(nextPostSaleMessage({ wonAt: new Date(now.getTime() - 90 * DAY), now, history: recent, ...settings }), null);
});

test('modelo guardado como nome:idioma', () => {
  assert.deepEqual(parseTemplateRef('andamento_processo:pt_BR'), { name: 'andamento_processo', language: 'pt_BR' });
  assert.equal(parseTemplateRef('Andamento'), null);
});
