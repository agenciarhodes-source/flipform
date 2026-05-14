import { createHash, randomInt } from 'crypto';

const OTP_SECRET = process.env.OTP_SECRET || process.env.JWT_SECRET_CURRENT || 'dev-otp-secret';

export function generateOtpCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function hashOtp(email: string, code: string): string {
  return createHash('sha256').update(`${OTP_SECRET}:${email.toLowerCase().trim()}:${code}`).digest('hex');
}
