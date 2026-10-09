import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIP_AI_PUBLIC_UNAVAILABLE_MESSAGE,
  toPublicFlipAiErrorMessage,
} from '../lib/flip-ai/public-error-message';

test('visitante nunca lê avisos de saldo, cobrança ou configuração da plataforma', () => {
  for (const code of [
    'FLIP_AI_CREDIT_BALANCE_INSUFFICIENT',
    'FLIP_AI_RUNTIME_BILLING_UNAVAILABLE',
    'FLIP_AI_CREDIT_SCHEMA_NOT_READY',
    'FLIP_AI_CREDIT_ACCOUNT_UNAVAILABLE',
    'OPENAI_API_KEY_MISSING',
  ]) {
    const shown = toPublicFlipAiErrorMessage(code, 'Saldo de créditos Flip AI insuficiente. Adicione créditos para continuar.');
    assert.equal(shown, FLIP_AI_PUBLIC_UNAVAILABLE_MESSAGE, code);
    assert.equal(/cr[eé]dito|saldo|carteira|openai/i.test(shown), false, code);
  }
});

test('demais mensagens voltadas ao visitante são preservadas', () => {
  assert.equal(toPublicFlipAiErrorMessage('PUBLIC_CHAT_RATE_LIMITED', 'Muitas mensagens. Aguarde um instante.'), 'Muitas mensagens. Aguarde um instante.');
  assert.equal(toPublicFlipAiErrorMessage('', 'Mensagem inválida.'), 'Mensagem inválida.');
});
