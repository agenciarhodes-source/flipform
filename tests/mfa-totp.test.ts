import assert from 'node:assert/strict';
import test from 'node:test';

import {
  base32Decode,
  base32Encode,
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  totpCode,
  verifyTotp,
} from '../lib/mfa/totp';

// RFC 6238 appendix B (SHA-1), secret "12345678901234567890"; the app shows the last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('códigos iguais aos vetores oficiais da RFC 6238 (Google Authenticator)', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totpCode(RFC_SECRET, 59_000), '287082');
  assert.equal(totpCode(RFC_SECRET, 1111111109_000), '081804');
  assert.equal(totpCode(RFC_SECRET, 1234567890_000), '005924');
  assert.equal(totpCode(RFC_SECRET, 2000000000_000), '279037');
});

test('base32 vai e volta', () => {
  const bytes = Buffer.from('FlipForm segurança');
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  assert.equal(generateTotpSecret().length, 32);
});

test('aceita o código atual e um passo de diferença de relógio, e nunca o mesmo código duas vezes', () => {
  const now = 1_800_000_000_000;
  const code = totpCode(RFC_SECRET, now);
  const counter = verifyTotp(RFC_SECRET, code, now);
  assert.equal(typeof counter, 'number');
  assert.equal(verifyTotp(RFC_SECRET, code, now + 30_000), (counter as number));
  assert.equal(verifyTotp(RFC_SECRET, code, now, counter), null);
  assert.equal(verifyTotp(RFC_SECRET, '000000', now) === null || totpCode(RFC_SECRET, now) === '000000', true);
  assert.equal(verifyTotp(RFC_SECRET, '12345', now), null);
  assert.equal(verifyTotp(RFC_SECRET, code, now + 5 * 60_000), null);
});

test('códigos de recuperação valem uma vez e só o hash é guardado', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.match(codes[0], /^[a-z2-7]{4}-[a-z2-7]{4}$/);
  const hashes = codes.map(hashRecoveryCode);
  const left = consumeRecoveryCode(hashes, ` ${codes[2].toUpperCase()} `);
  assert.equal(left?.length, 7);
  assert.equal(consumeRecoveryCode(left!, codes[2]), null);
});

test('link do aplicativo autenticador', () => {
  assert.match(otpauthUri('ABC', 'maria@exemplo.com'), /^otpauth:\/\/totp\/FlipForm%3Amaria%40exemplo\.com\?secret=ABC&issuer=FlipForm/);
});
