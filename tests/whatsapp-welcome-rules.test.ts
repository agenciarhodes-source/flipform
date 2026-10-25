import assert from 'node:assert/strict';
import test from 'node:test';

import { customerAlreadyWrote, welcomeDelaySeconds, welcomeSkipReason, welcomeWindow } from '../lib/whatsapp-ai/welcome-rules';

const now = new Date('2026-10-24T15:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

test('espera os minutos combinados e só olha cadastros depois de ligar', () => {
  const window = welcomeWindow({ enabledAt: minutesAgo(30), delaySeconds: 90, now });
  assert.equal(window.from.toISOString(), minutesAgo(30).toISOString());
  assert.equal(window.until.toISOString(), minutesAgo(1.5).toISOString());
  // Ligado há dias: só as últimas 24 horas.
  const old = welcomeWindow({ enabledAt: minutesAgo(5 * 24 * 60), delaySeconds: 90, now });
  assert.equal(old.from.toISOString(), minutesAgo(24 * 60).toISOString());
});

test('a espera é em segundos (1 min 30 s), com as configurações antigas em minutos', () => {
  assert.equal(welcomeDelaySeconds({ delaySeconds: 90, delayMinutes: 2 }), 90);
  assert.equal(welcomeDelaySeconds({ delaySeconds: null, delayMinutes: 2 }), 120);
  assert.equal(welcomeDelaySeconds({ delaySeconds: 5, delayMinutes: 1 }), 30);
});

test('quem já escreveu no WhatsApp não recebe o modelo', () => {
  assert.equal(customerAlreadyWrote(minutesAgo(1), now), true);
  assert.equal(customerAlreadyWrote(minutesAgo(25 * 60), now), false);
  assert.equal(customerAlreadyWrote(null, now), false);
});

test('sem autorização, com SAIR ou sem celular válido, não envia', () => {
  assert.equal(welcomeSkipReason({ consent: true, optedOut: false, validMobile: true }), null);
  assert.equal(welcomeSkipReason({ consent: false, optedOut: false, validMobile: true }), 'no_consent');
  assert.equal(welcomeSkipReason({ consent: true, optedOut: true, validMobile: true }), 'opted_out');
  assert.equal(welcomeSkipReason({ consent: true, optedOut: false, validMobile: false }), 'invalid_phone');
});
