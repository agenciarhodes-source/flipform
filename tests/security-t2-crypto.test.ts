// Security protocol T2: tokens of integrations stay readable and tampering is refused.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { decryptIntegrationSecret, encryptIntegrationSecret } from '../lib/tracking/crypto';

// The key is read when a value is sealed or opened, so it can be set here.
process.env.INTEGRATION_SECRET_KEY = 'test-only-integration-key-0123456789';

function legacyEncrypt(value: string) {
  // How values were written before the tag length was fixed: same algorithm, default 16-byte tag.
  const key = crypto.createHash('sha256').update(process.env.INTEGRATION_SECRET_KEY!).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `ffenc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

test('o que já está salvo continua abrindo (tokens da Meta, Google, WhatsApp)', () => {
  assert.equal(decryptIntegrationSecret(legacyEncrypt('token-antigo-123')), 'token-antigo-123');
});

test('cifra e decifra o mesmo valor', () => {
  const sealed = encryptIntegrationSecret('segredo-de-teste');
  assert.ok(sealed.startsWith('ffenc:v1:'));
  assert.equal(decryptIntegrationSecret(sealed), 'segredo-de-teste');
});

test('selo encurtado é recusado sem tentar abrir', () => {
  const [prefix, payload] = ['ffenc:v1:', encryptIntegrationSecret('segredo').slice('ffenc:v1:'.length)];
  const [iv, tag, data] = payload.split(':');
  const shortTag = Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url');
  assert.equal(decryptIntegrationSecret(`${prefix}${iv}:${shortTag}:${data}`), null);
});

test('valor adulterado não abre', () => {
  const payload = encryptIntegrationSecret('segredo').slice('ffenc:v1:'.length);
  const [iv, tag, data] = payload.split(':');
  const bytes = Buffer.from(data, 'base64url');
  bytes[0] ^= 0xff;
  assert.throws(() => decryptIntegrationSecret(`ffenc:v1:${iv}:${tag}:${bytes.toString('base64url')}`));
});
