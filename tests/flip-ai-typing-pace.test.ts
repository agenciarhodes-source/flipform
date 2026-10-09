import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIP_AI_TYPING_MAX_MS,
  FLIP_AI_TYPING_MIN_MS,
  FLIP_AI_TYPING_MS_PER_CHARACTER,
  resolveTypingDelayMs,
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
