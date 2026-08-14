import 'server-only';
import crypto from 'crypto';
import {
  META_ADS_ONBOARDING_PURPOSE,
  type MetaOnboardingPurpose,
} from './onboarding';

export const META_OAUTH_STATE_COOKIE = 'flipform_meta_oauth_state';
export const META_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const META_OAUTH_STATE_COOKIE_PATH = '/api/integrations/meta';

type StatePayload = {
  nonce: string;
  tenantId: string;
  userId: string;
  purpose: MetaOnboardingPurpose;
  expiresAt: number;
};

function secret() {
  const value = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
  if (!value) throw new Error('OAuth state signing key is unavailable');
  return value;
}
function sign(encoded: string) { return crypto.createHmac('sha256', secret()).update(encoded).digest('base64url'); }

export function createMetaOAuthStateForPurpose(
  tenantId: string,
  userId: string,
  purpose: MetaOnboardingPurpose,
  now = Date.now(),
) {
  const payload: StatePayload = {
    nonce: crypto.randomBytes(32).toString('base64url'),
    tenantId,
    userId,
    purpose,
    expiresAt: now + META_OAUTH_STATE_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { state: payload.nonce, cookie: `${encoded}.${sign(encoded)}` };
}

export function verifyMetaOAuthStateForPurpose(
  cookie: string | undefined,
  state: string | null,
  tenantId: string,
  userId: string,
  purpose: MetaOnboardingPurpose,
  now = Date.now(),
) {
  if (!cookie || !state) return false;
  const [encoded, signature] = cookie.split('.');
  if (!encoded || !signature) return false;
  const expected = sign(encoded);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Partial<StatePayload>;
    return payload.nonce === state
      && payload.tenantId === tenantId
      && payload.userId === userId
      && payload.purpose === purpose
      && typeof payload.expiresAt === 'number'
      && payload.expiresAt > now;
  } catch { return false; }
}

// Backward-compatible Ads wrappers. Existing Ads callers/tests remain simple,
// while new channels must use the explicit purpose helpers above.
export function createMetaOAuthState(tenantId: string, userId: string, now = Date.now()) {
  return createMetaOAuthStateForPurpose(tenantId, userId, META_ADS_ONBOARDING_PURPOSE, now);
}

export function verifyMetaOAuthState(
  cookie: string | undefined,
  state: string | null,
  tenantId: string,
  userId: string,
  now = Date.now(),
) {
  return verifyMetaOAuthStateForPurpose(cookie, state, tenantId, userId, META_ADS_ONBOARDING_PURPOSE, now);
}
