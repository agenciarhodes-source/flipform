import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type VaultBinding = Readonly<{ tenantId: string; connectionId: string; providerId: string }>;
export type VaultKey = Readonly<{ id: string; bytes: Buffer }>;
export type VaultEnvelope = Readonly<{ keyId: string; ciphertext: string }>;

function aad(binding: VaultBinding, keyId: string): Buffer {
  if (!binding.tenantId || !binding.connectionId || !binding.providerId) throw new Error('Invalid vault binding');
  return Buffer.from(JSON.stringify(['universal-connect:v1', binding.tenantId, binding.connectionId, binding.providerId, keyId]));
}
function validateKey(key: VaultKey) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key.id) || key.bytes.length !== 32) throw new Error('Invalid vault configuration');
}
export function currentVaultKey(env: Readonly<Record<string, string | undefined>> = process.env): VaultKey {
  const raw = env.UNIVERSAL_CONNECT_VAULT_KEY ?? '';
  const id = env.UNIVERSAL_CONNECT_VAULT_KEY_ID ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new Error('Invalid vault configuration');
  const bytes = Buffer.from(raw, 'base64url');
  if (bytes.toString('base64url') !== raw) throw new Error('Invalid vault configuration');
  const key = { id, bytes };
  validateKey(key);
  return key;
}
export function sealCredential(secret: string, binding: VaultBinding, key: VaultKey): VaultEnvelope {
  validateKey(key);
  if (!secret || Buffer.byteLength(secret, 'utf8') > 16384) throw new Error('Invalid credential');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.bytes, iv, { authTagLength: 16 });
  cipher.setAAD(aad(binding, key.id));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { keyId: key.id, ciphertext: ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':') };
}
/** Internal only; never return plaintext through a route, log or AI tool. */
export function openCredential(envelope: VaultEnvelope, binding: VaultBinding, key: VaultKey): string {
  try {
    validateKey(key);
    if (key.id !== envelope.keyId || envelope.ciphertext.length > 23000) throw new Error();
    const parts = envelope.ciphertext.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error();
    const decode = (part: string) => {
      const value = Buffer.from(part, 'base64url');
      if (!value.length || value.toString('base64url') !== part) throw new Error();
      return value;
    };
    const iv = decode(parts[1]), tag = decode(parts[2]), data = decode(parts[3]);
    if (iv.length !== 12 || tag.length !== 16 || data.length > 16384) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key.bytes, iv, { authTagLength: 16 });
    decipher.setAAD(aad(binding, key.id));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Vault credential unavailable');
  }
}
