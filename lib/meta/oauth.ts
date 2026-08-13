import 'server-only';
import crypto from 'crypto';

export const META_PLATFORM_GRAPH_API_VERSION = 'v26.0';
export const META_PLATFORM_REQUIRED_SCOPES = ['ads_read', 'ads_management', 'business_management'] as const;
export const META_BUSINESS_LOGIN_TOKEN_TYPES = ['USER', 'SYSTEM_USER'] as const;
const OAUTH_HOST = 'www.facebook.com';
const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;
const SYSTEM_USER_ACCOUNT_LIMIT = 50;

type MetaGranularScope = {
  scope?: unknown;
  target_ids?: unknown;
};

type ParsedMetaGranularScopes = {
  names: string[];
  targetCounts: Record<string, number>;
};

type SystemUserAssetAccess = {
  authorized: boolean;
  adAccountCount: number;
  accountsChecked: number;
  pixelCount: number;
};

function normalizeScope(scope: unknown): string | null {
  if (typeof scope !== 'string') return null;
  const normalized = scope.trim();
  return normalized || null;
}

function getNormalizedScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) return [];
  return scopes.map(normalizeScope).filter((scope): scope is string => scope !== null);
}

function getGraphAdAccountId(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const value = entry as { id?: unknown; account_id?: unknown };
  if (typeof value.account_id === 'string' && /^\d+$/.test(value.account_id)) return `act_${value.account_id}`;
  if (typeof value.id === 'string' && /^act_\d+$/.test(value.id)) return value.id;
  if (typeof value.id === 'string' && /^\d+$/.test(value.id)) return `act_${value.id}`;
  return null;
}

function countValidIds(data: unknown): number {
  if (!Array.isArray(data)) return 0;
  return data.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof (entry as { id?: unknown }).id === 'string' && Boolean((entry as { id: string }).id)).length;
}

export function parseMetaGranularScopes(granularScopes: unknown): ParsedMetaGranularScopes {
  if (!Array.isArray(granularScopes)) return { names: [], targetCounts: {} };

  const names: string[] = [];
  const targetCounts: Record<string, number> = {};
  for (const entry of granularScopes) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const granularScope = entry as MetaGranularScope;
    const scope = normalizeScope(granularScope.scope);
    if (!scope || (granularScope.target_ids !== undefined && !Array.isArray(granularScope.target_ids))) continue;
    const targets = Array.isArray(granularScope.target_ids)
      ? granularScope.target_ids.filter((targetId): targetId is string => typeof targetId === 'string')
      : [];
    names.push(scope);
    targetCounts[scope] = (targetCounts[scope] ?? 0) + targets.length;
  }
  return { names, targetCounts };
}

export function getEffectiveGrantedScopes(scopes: unknown, granularScopes: unknown): string[] {
  const topLevelScopes = getNormalizedScopes(scopes);
  const granularScopeNames = parseMetaGranularScopes(granularScopes).names;
  return [...new Set([...topLevelScopes, ...granularScopeNames])];
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

async function metaJson(url: URL, operation: string, accessToken?: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
  } catch {
    throw new Error(`Meta ${operation} unavailable`);
  }
  let data: any;
  try { data = await response.json(); } catch { throw new Error(`Meta ${operation} invalid response`); }
  if (!response.ok || data?.error) {
    console.error('Meta OAuth request failed', { operation, httpStatus: response.status, metaCode: data?.error?.code, metaType: data?.error?.type });
    throw new Error(`Meta ${operation} failed`);
  }
  return data;
}

export async function validateMetaSystemUserAssetAccess(input: { accessToken: string; appSecret: string; systemUserId: string }): Promise<SystemUserAssetAccess> {
  const appSecretProof = createAppSecretProof(input.accessToken, input.appSecret);
  const assignedAccountsUrl = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${encodeURIComponent(input.systemUserId)}/assigned_ad_accounts`);
  assignedAccountsUrl.search = new URLSearchParams({ fields: 'id,account_id', limit: String(SYSTEM_USER_ACCOUNT_LIMIT), appsecret_proof: appSecretProof }).toString();
  const assignedAccounts = await metaJson(assignedAccountsUrl, 'system_user_assigned_ad_accounts', input.accessToken);
  const graphAccountIds = [...new Set((Array.isArray(assignedAccounts?.data) ? assignedAccounts.data : []).map(getGraphAdAccountId).filter((id): id is string => id !== null))];

  let accountsChecked = 0;
  let pixelCount = 0;
  for (const accountId of graphAccountIds) {
    accountsChecked += 1;
    const pixelsUrl = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${accountId}/adspixels`);
    pixelsUrl.search = new URLSearchParams({ fields: 'id', limit: '100', appsecret_proof: appSecretProof }).toString();
    const pixels = await metaJson(pixelsUrl, 'system_user_ad_account_pixels', input.accessToken);
    pixelCount += countValidIds(pixels?.data);
    if (pixelCount > 0) break;
  }

  return {
    authorized: graphAccountIds.length > 0 && pixelCount > 0,
    adAccountCount: graphAccountIds.length,
    accountsChecked,
    pixelCount,
  };
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

  const tokenType = typeof debuggedToken.type === 'string' ? debuggedToken.type : null;
  const topLevelScopes = [...new Set(getNormalizedScopes(debuggedToken.scopes))];
  const granularScopes = parseMetaGranularScopes(debuggedToken.granular_scopes);
  const effectiveGrantedScopes = getEffectiveGrantedScopes(topLevelScopes, debuggedToken.granular_scopes);
  const missingScopes = META_PLATFORM_REQUIRED_SCOPES.filter(scope => !effectiveGrantedScopes.includes(scope));
  const systemUserAssetAccess = tokenType === 'SYSTEM_USER'
    ? await validateMetaSystemUserAssetAccess({ accessToken: input.accessToken, appSecret: input.appSecret, systemUserId: debuggedToken.user_id })
    : null;
  const authorizationSatisfied = tokenType === 'SYSTEM_USER'
    ? systemUserAssetAccess?.authorized === true
    : missingScopes.length === 0;
  const authorizationMethod = tokenType === 'SYSTEM_USER' ? 'system_user_asset_access' : 'scope_validation';

  const expiresAtSeconds = debuggedToken.expires_at;
  const tokenExpiresAt = typeof expiresAtSeconds === 'number' && Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0
    ? new Date(expiresAtSeconds * 1000)
    : null;
  return {
    metaUserId: debuggedToken.user_id as string,
    metaUserName: null,
    tokenType,
    grantedScopes: effectiveGrantedScopes,
    missingScopes,
    authorizationSatisfied,
    authorizationMethod,
    tokenExpiresAt,
    diagnostics: {
      tokenType,
      authorizationMethod,
      topLevelScopes,
      granularScopeNames: [...new Set(granularScopes.names)],
      effectiveScopes: effectiveGrantedScopes,
      missingScopes,
      granularTargetCounts: granularScopes.targetCounts,
      systemUserAssetAccess,
      hasExpiration: tokenExpiresAt !== null,
    },
  };
}
