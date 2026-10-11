import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIP_AI_TYPING_MAX_MS,
  FLIP_AI_TYPING_MIN_MS,
  FLIP_AI_TYPING_MS_PER_CHARACTER,
  resolveTypingDelayMs,
  splitReplyIntoMessages,
} from '../lib/flip-ai/typing-pace';

test('resposta curta respeita o tempo mínimo e resposta longa o máximo', () => {
  assert.equal(resolveTypingDelayMs(5, 0), FLIP_AI_TYPING_MIN_MS);
  assert.equal(resolveTypingDelayMs(100, 0), 100 * FLIP_AI_TYPING_MS_PER_CHARACTER);
  assert.equal(resolveTypingDelayMs(5_000, 0), FLIP_AI_TYPING_MAX_MS);
});

test('o tempo que o modelo já gastou é descontado e nunca fica negativo', () => {
  assert.equal(resolveTypingDelayMs(100, 1_500), 2_000);
  assert.equal(resolveTypingDelayMs(100, 60_000), 0);
  assert.equal(resolveTypingDelayMs(Number.NaN, Number.NaN), FLIP_AI_TYPING_MIN_MS);
});

test('resposta com linhas em branco vira mensagens separadas, sem perder texto', () => {
  assert.deepEqual(splitReplyIntoMessages('Sim, fazemos.'), ['Sim, fazemos.']);
  assert.deepEqual(splitReplyIntoMessages('Sim, fazemos.\n\nComo está hoje?'), ['Sim, fazemos.', 'Como está hoje?']);
  assert.deepEqual(splitReplyIntoMessages('a\n\nb\r\n\r\nc\n\nd'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(splitReplyIntoMessages('a\n\nb\n\nc\n\nd\n\ne?'), ['a', 'b', 'c d', 'e?']);
  assert.deepEqual(splitReplyIntoMessages('linha 1\nlinha 2'), ['linha 1\nlinha 2']);
  assert.deepEqual(splitReplyIntoMessages('  \n\n  '), ['']);
});

test('mensagem longa é dividida em frases inteiras e a pergunta final fica sozinha', () => {
  const long = 'Temos planos a partir de R$ 997 por mês, mais a verba de anúncios. '
    + 'O Starter custa R$ 997/mês (verba mínima de R$ 1.000), o Growth R$ 1.997/mês (mínimo de R$ 3.000) e o Scale R$ 3.497/mês. '
    + 'Você já tem uma verba mensal de anúncios em mente?';
  const parts = splitReplyIntoMessages(long);
  assert.equal(parts[parts.length - 1], 'Você já tem uma verba mensal de anúncios em mente?');
  assert.ok(parts.length >= 2);
  // Nothing is lost and a price is never cut at its thousands separator.
  assert.equal(parts.join(' '), long);
  assert.ok(parts.every((part) => !/R\$ \d$/.test(part)));
  assert.ok(parts.slice(0, -1).every((part) => part.length <= 180));
});

test('mensagem curta com pergunta no fim separa só a pergunta', () => {
  assert.deepEqual(
    splitReplyIntoMessages('Sim, fazemos gestão de tráfego. Você já anuncia hoje?'),
    ['Sim, fazemos gestão de tráfego.', 'Você já anuncia hoje?'],
  );
  assert.deepEqual(splitReplyIntoMessages('Você já anuncia hoje?'), ['Você já anuncia hoje?']);
});
