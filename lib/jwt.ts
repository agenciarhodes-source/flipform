import jwt from 'jsonwebtoken';

export interface JwtSessionPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
  tenantSlug: string;
  globalRole?: string | null;
}

const JWT_SECRET_CURRENT = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS;

if (!JWT_SECRET_CURRENT) {
  throw new Error('Missing JWT_SECRET_CURRENT (or JWT_SECRET fallback) environment variable.');
}

function getSecretsForVerify(): string[] {
  return JWT_SECRET_PREVIOUS ? [JWT_SECRET_CURRENT!, JWT_SECRET_PREVIOUS] : [JWT_SECRET_CURRENT!];
}

export function signSessionToken(payload: JwtSessionPayload): string {
  return jwt.sign(payload, JWT_SECRET_CURRENT!, { expiresIn: '7d' });
}

export function verifySessionToken(token: string): JwtSessionPayload | null {
  for (const secret of getSecretsForVerify()) {
    try {
      return jwt.verify(token, secret) as JwtSessionPayload;
    } catch {
      // try next secret
    }
  }
  return null;
}

export function getJoseSecretsForVerify(): Uint8Array[] {
  return getSecretsForVerify().map((s) => new TextEncoder().encode(s));
}
