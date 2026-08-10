import 'server-only';
import crypto from 'crypto';

export const META_PLATFORM_GRAPH_API_VERSION = 'v26.0';
export const META_PLATFORM_REQUIRED_SCOPES = ['ads_read', 'ads_management', 'business_management'] as const;
const OAUTH_HOST = 'www.facebook.com';
const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;

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

export async function validateMetaAuthorization(accessToken: string, appSecret: string) {
  const proof = createAppSecretProof(accessToken, appSecret);
  const identityUrl = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/me`);
  identityUrl.search = new URLSearchParams({ fields: 'id,name', access_token: accessToken, appsecret_proof: proof }).toString();
  const permissionsUrl = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/me/permissions`);
  permissionsUrl.search = new URLSearchParams({ access_token: accessToken, appsecret_proof: proof }).toString();
  const [identity, permissions] = await Promise.all([metaJson(identityUrl, 'identity_validation'), metaJson(permissionsUrl, 'scope_validation')]);
  if (typeof identity.id !== 'string' || !identity.id) throw new Error('Meta identity_validation failed');
  const grantedScopes = Array.isArray(permissions.data) ? permissions.data.filter((p: any) => p?.status === 'granted' && typeof p.permission === 'string').map((p: any) => p.permission) : [];
  const missingScopes = META_PLATFORM_REQUIRED_SCOPES.filter(scope => !grantedScopes.includes(scope));
  return { metaUserId: identity.id as string, metaUserName: typeof identity.name === 'string' ? identity.name : null, grantedScopes, missingScopes };
}
