import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Two-step verification (security protocol S5): TOTP codes as in RFC 6238, the standard used by
 * Google Authenticator, Microsoft Authenticator and others: 6 digits, a new one every 30 seconds.
 * Pure functions, easy to test.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new secret: 20 random bytes (160 bits), written in base32 for the authenticator app. */
export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpCounter(timeMs: number) {
  return Math.floor(timeMs / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secretBase32: string, counter: number) {
  const key = base32Decode(secretBase32);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function totpCode(secretBase32: string, timeMs: number) {
  return hotp(secretBase32, totpCounter(timeMs));
}

function sameText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The time step of a valid code (one step of clock difference is accepted each way), or null.
 * A code already used (step not newer than lastCounter) is refused, so a seen code cannot be replayed.
 */
export function verifyTotp(secretBase32: string, code: string, timeMs: number, lastCounter: number | null = null) {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const now = totpCounter(timeMs);
  for (const counter of [now, now - 1, now + 1]) {
    if (lastCounter !== null && counter <= lastCounter) continue;
    if (sameText(hotp(secretBase32, counter), clean)) return counter;
  }
  return null;
}

/** The link the authenticator app reads from the QR code. */
export function otpauthUri(secretBase32: string, account: string, issuer = 'FlipForm') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/** One-time recovery codes, for a lost phone. Only their hashes are stored. */
export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

export function hashRecoveryCode(code: string) {
  return createHash('sha256').update(code.trim().toLowerCase().replace(/\s/g, '')).digest('hex');
}

/** The remaining hashes after using a recovery code, or null when the code is not valid. */
export function consumeRecoveryCode(hashes: string[], code: string) {
  const hash = hashRecoveryCode(code);
  const index = hashes.findIndex((item) => sameText(item, hash));
  if (index < 0) return null;
  return hashes.filter((_, position) => position !== index);
}
