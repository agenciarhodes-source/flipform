import 'server-only';

import { META_ONBOARDING_CHANNELS, META_INSTAGRAM_ONBOARDING_PURPOSE } from './onboarding';

export const INSTAGRAM_GRAPH_VERSION = 'v26.0';
export const INSTAGRAM_AUTHORIZATION_URL = 'https://www.instagram.com/oauth/authorize';
export const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
export const INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com';
export const INSTAGRAM_REQUIRED_SCOPES = META_ONBOARDING_CHANNELS[META_INSTAGRAM_ONBOARDING_PURPOSE].requiredScopes;

const FETCH_TIMEOUT_MS = 10_000;

type JsonObject = Record<string, any>;

async function fetchJson(url: string, init: RequestInit, operation: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const text = await response.text();
    let payload: JsonObject = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(`Instagram ${operation} failed`);
      (error as any).status = response.status;
      (error as any).providerCode = payload?.error?.code || payload?.code || null;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildInstagramAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(INSTAGRAM_AUTHORIZATION_URL);
  url.search = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_REQUIRED_SCOPES.join(','),
    state: input.state,
  }).toString();
  return url.toString();
}

export async function exchangeInstagramAuthorizationCode(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}) {
  const body = new FormData();
  body.set('client_id', input.appId);
  body.set('client_secret', input.appSecret);
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', input.redirectUri);
  body.set('code', input.code);

  const payload = await fetchJson(INSTAGRAM_TOKEN_URL, { method: 'POST', body }, 'authorization_code_exchange');
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('Instagram authorization code exchange returned no access token');
  }
  return {
    accessToken: payload.access_token as string,
    instagramUserId: payload.user_id != null ? String(payload.user_id) : null,
  };
}

export async function exchangeInstagramLongLivedToken(input: {
  appSecret: string;
  accessToken: string;
}) {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/access_token`);
  url.search = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: input.appSecret,
    access_token: input.accessToken,
  }).toString();

  const payload = await fetchJson(url.toString(), { method: 'GET' }, 'long_lived_token_exchange');
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('Instagram long-lived token exchange returned no access token');
  }
  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: payload.access_token as string,
    expiresInSeconds: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null,
  };
}

export async function validateInstagramProfessionalAccount(input: { accessToken: string }) {
  const profileUrl = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${INSTAGRAM_GRAPH_VERSION}/me`);
  profileUrl.searchParams.set('fields', 'id,username');
  const profile = await fetchJson(profileUrl.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${input.accessToken}` },
  }, 'profile_validation');

  if (typeof profile.id !== 'string' && typeof profile.id !== 'number') {
    throw new Error('Instagram profile validation returned no professional account id');
  }
  if (typeof profile.username !== 'string' || !profile.username) {
    throw new Error('Instagram profile validation returned no username');
  }

  // A lightweight Conversations API call verifies that this token can manage
  // messages for the authenticated Instagram professional account. Empty data
  // is valid; a missing permission is returned by Meta as an API error.
  const conversationsUrl = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${INSTAGRAM_GRAPH_VERSION}/me/conversations`);
  conversationsUrl.searchParams.set('limit', '1');
  await fetchJson(conversationsUrl.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${input.accessToken}` },
  }, 'messaging_permission_validation');

  return {
    instagramUserId: String(profile.id),
    username: profile.username as string,
  };
}
