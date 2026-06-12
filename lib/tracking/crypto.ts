import 'server-only';
import crypto from 'crypto';

const PREFIX = 'ffenc:v1:';

function getKey(): Buffer {
  const secret = process.env.INTEGRATION_SECRET_KEY;
  if (!secret || secret.trim().length < 16) {
    throw new Error('INTEGRATION_SECRET_KEY ausente ou inválida. Configure a variável para salvar tokens de integrações.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptIntegrationSecret(value: string): string {
  const plain = value.trim();
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptIntegrationSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return null;
  const [, payload] = value.split(PREFIX);
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(':');
  if (!ivRaw || !tagRaw || !encryptedRaw) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskSecretFromEncrypted(value: string | null | undefined): string | null {
  if (!value) return null;
  return '••••••••••••salvo';
}

export function looksMaskedSecret(value: unknown): boolean {
  return typeof value === 'string' && (value.includes('••') || value === '********' || value === '************');
}
