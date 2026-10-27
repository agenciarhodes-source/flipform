import assert from 'node:assert/strict';
import test from 'node:test';

import { FORM_MIN_FILL_MS, formBotReason } from '../lib/forms/bot-guard';

test('pessoa de verdade passa', () => {
  assert.equal(formBotReason({ hp: '', elapsedMs: 45_000 }), null);
  assert.equal(formBotReason({ hp: '', elapsedMs: FORM_MIN_FILL_MS }), null);
});

test('robô que preenche o campo escondido é barrado', () => {
  assert.equal(formBotReason({ hp: 'https://spam.example', elapsedMs: 60_000 }), 'honeypot');
});

test('envio rápido demais para uma pessoa é barrado', () => {
  assert.equal(formBotReason({ hp: '', elapsedMs: 300 }), 'too_fast');
});

test('páginas antigas e integrações sem a checagem continuam aceitas', () => {
  assert.equal(formBotReason(undefined), null);
  assert.equal(formBotReason({}), null);
});
