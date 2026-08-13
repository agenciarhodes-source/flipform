import 'server-only';
import crypto from 'crypto';

export const META_PLATFORM_GRAPH_API_VERSION = 'v26.0';
export const META_PLATFORM_REQUIRED_SCOPES = ['ads_read', 'ads_management', 'business_management'] as const;
export const META_BUSINESS_LOGIN_TOKEN_TYPES = ['USER', 'SYSTEM_USER'] as const;
const OAUTH_HOST = 'www.facebook.com';
const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;

type MetaGranularScope = {
  scope?: unknown;
  target_ids?: unknown;
};

function normalizeScope(scope: unknown): string | null {
  if (typeof scope !== 'string') return null;
  const normalized = scope.trim();
  return normalized || null;
}

export function getEffectiveGrantedScopes(scopes: unknown, granularScopes: unknown): string[] {
  const topLevelScopes = Array.isArray(scopes) ? scopes : [];
  const granularScopeNames = Array.isArray(granularScopes)
    ? granularScopes.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      return normalizeScope((entry as MetaGranularScope).scope);
    })
    : [];

  return [...new Set([...topLevelScopes.map(normalizeScope), ...granularScopeNames].filter((scope): scope is string => scope !== null))];
}

export function buildMetaAuthorizationUrl(input: { appId: string; redirectUri: string; state: string; businessLoginConfigId: string }) {
  const url = new URL(`https://${OAUTH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: input.appId, redirect_uri: input.redirectUri, state: input.state, config_id: input.businessLoginConfigId, response_type: 'code' }).toString();
  if (url.protocol !== 'https:' || url.hostname !== OAUTH_HOST) throw new Error('Invalid Meta authorization host');
  return url.toString();
}

export function createAppSecretProof(accessToken: string, appSecret: string) {
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

async function metaJson(url: URL, operation: string) {
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' }); }
  catch { throw new Error(`Meta ${operation} unavailable`); }
  let data: any;
  try { data = await response.json(); } catch { throw new Error(`Meta ${operation} invalid response`); }
  if (!response.ok || data?.error) {
    console.error('Meta OAuth request failed', { operation, httpStatus: response.status, metaCode: data?.error?.code, metaType: data?.error?.type });
    throw new Error(`Meta ${operation} failed`);
  }
  return data;
}

export async function exchangeMetaAuthorizationCode(input: { appId: string; appSecret: string; redirectUri: string; code: string }) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: input.appId, client_secret: input.appSecret, redirect_uri: input.redirectUri, code: input.code }).toString();
  const data = await metaJson(url, 'token_exchange');
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Meta token_exchange missing token');
  return { accessToken: data.access_token as string, expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null };
}

export async function validateMetaAuthorization(input: { accessToken: string; appId: string; appSecret: string }) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/debug_token`);
  // Meta documents app_id|app_secret as an App Access Token. It remains server-side.
  url.search = new URLSearchParams({ input_token: input.accessToken, access_token: `${input.appId}|${input.appSecret}` }).toString();
  const inspected = await metaJson(url, 'token_inspection');
  const debuggedToken = inspected?.data;
  if (!debuggedToken || debuggedToken.is_valid !== true) throw new Error('Meta token_inspection invalid token');
  if (String(debuggedToken.app_id ?? '') !== input.appId) throw new Error('Meta token_inspection app mismatch');
  if (debuggedToken.type != null && !META_BUSINESS_LOGIN_TOKEN_TYPES.includes(debuggedToken.type)) {
    throw new Error('Meta token_inspection unsupported token type');
  }
  if (typeof debuggedToken.user_id !== 'string' || !debuggedToken.user_id) {
    throw new Error('Meta token_inspection missing principal');
  }
  // Business Login may report asset-bound permissions only in granular_scopes.
  // target_ids describe those assets; they are not permission names and are never
  // promoted to scopes or persisted by this authorization step.
  const effectiveGrantedScopes = getEffectiveGrantedScopes(debuggedToken.scopes, debuggedToken.granular_scopes);
  const missingScopes = META_PLATFORM_REQUIRED_SCOPES.filter(scope => !effectiveGrantedScopes.includes(scope));
  const expiresAtSeconds = debuggedToken.expires_at;
  const tokenExpiresAt = typeof expiresAtSeconds === 'number' && Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0
    ? new Date(expiresAtSeconds * 1000)
    : null;
  return {
    metaUserId: debuggedToken.user_id as string,
    metaUserName: null,
    tokenType: typeof debuggedToken.type === 'string' ? debuggedToken.type : null,
    grantedScopes: effectiveGrantedScopes,
    missingScopes,
    tokenExpiresAt,
  };
}
