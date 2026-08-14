import 'server-only';
import crypto from 'crypto';
import {
  META_ADS_ONBOARDING_PURPOSE,
  type MetaOnboardingPurpose,
} from './onboarding';

export const META_OAUTH_STATE_COOKIE = 'flipform_meta_oauth_state';
export const META_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const META_OAUTH_STATE_COOKIE_PATH = '/api/integrations/meta';

export const META_ADS_AUTHORIZATION_MODES = ['client_authorized', 'platform_managed'] as const;
export type MetaAdsAuthorizationMode = (typeof META_ADS_AUTHORIZATION_MODES)[number];

type StatePayload = {
  nonce: string;
  tenantId: string;
  userId: string;
  purpose: MetaOnboardingPurpose;
  authorizationMode: MetaAdsAuthorizationMode;
  expiresAt: number;
};

function secret() {
  const value = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
  if (!value) throw new Error('OAuth state signing key is unavailable');
  return value;
}
function sign(encoded: string) { return crypto.createHmac('sha256', secret()).update(encoded).digest('base64url'); }

function createState(
  tenantId: string,
  userId: string,
  purpose: MetaOnboardingPurpose,
  authorizationMode: MetaAdsAuthorizationMode,
  now = Date.now(),
) {
  const payload: StatePayload = {
    nonce: crypto.randomBytes(32).toString('base64url'),
    tenantId,
    userId,
    purpose,
    authorizationMode,
    expiresAt: now + META_OAUTH_STATE_TTL_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { state: payload.nonce, cookie: `${encoded}.${sign(encoded)}` };
}

export function createMetaOAuthStateForPurpose(
  tenantId: string,
  userId: string,
  purpose: MetaOnboardingPurpose,
  now = Date.now(),
) {
  return createState(tenantId, userId, purpose, 'client_authorized', now);
}

export function createPlatformManagedMetaOAuthStateForPurpose(
  tenantId: string,
  userId: string,
  purpose: MetaOnboardingPurpose,
  now = Date.now(),
) {
  return createState(tenantId, userId, purpose, 'platform_managed', now);
}

export function readMetaOAuthStateForPurpose(
  cookie: string | undefined,
  state: string | null,
  userId: string,
  purpose: MetaOnboardingPurpose,
  now = Date.now(),
): StatePayload | null {
  if (!cookie || !state) return null;
  const [encoded, signature] = cookie.split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Partial<StatePayload>;
    const validMode = payload.authorizationMode === 'client_authorized' || payload.authorizationMode === 'platform_managed';
    if (
      payload.nonce !== state
      || payload.userId !== userId
      || payload.purpose !== purpose
      || !validMode
      || typeof payload.tenantId !== 'string'
      || !payload.tenantId
      || typeof payload.expiresAt !== 'number'
      || payload.expiresAt <= now
    ) return null;
    return payload as StatePayload;
  } catch { return null; }
}

export function verifyMetaOAuthStateForPurpose(
  cookie: string | undefined,
  state: string | null,
  tenantId: string,
  userId: string,
  purpose: MetaOnboardingPurpose,
  now = Date.now(),
) {
  const payload = readMetaOAuthStateForPurpose(cookie, state, userId, purpose, now);
  return payload?.tenantId === tenantId;
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
