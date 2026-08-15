import 'server-only';
import { createAppSecretProof, getEffectiveGrantedScopes, META_PLATFORM_GRAPH_API_VERSION } from './oauth';

const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;
export const WHATSAPP_EMBEDDED_SIGNUP_REQUIRED_SCOPES = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const;

type MetaGranularScope = { scope?: unknown; target_ids?: unknown };

type WhatsAppPhone = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
};

async function metaJson(url: URL, operation: string, input: { accessToken?: string; method?: 'GET' | 'POST' } = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method || 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : undefined,
    });
  } catch {
    throw new Error(`Meta WhatsApp ${operation} unavailable`);
  }

  let data: any;
  try { data = await response.json(); } catch { throw new Error(`Meta WhatsApp ${operation} invalid response`); }
  if (!response.ok || data?.error) {
    console.error('Meta WhatsApp request failed', {
      operation,
      httpStatus: response.status,
      metaCode: data?.error?.code,
      metaType: data?.error?.type,
    });
    throw new Error(`Meta WhatsApp ${operation} failed`);
  }
  return data;
}

export async function exchangeWhatsAppEmbeddedSignupCode(input: { appId: string; appSecret: string; code: string }) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/oauth/access_token`);
  url.search = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
  }).toString();
  const data = await metaJson(url, 'embedded_signup_token_exchange');
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Meta WhatsApp embedded_signup_token_exchange missing token');
  }
  return {
    accessToken: data.access_token as string,
    expiresIn: typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : null,
  };
}

export async function validateWhatsAppEmbeddedSignupToken(input: {
  accessToken: string;
  appId: string;
  appSecret: string;
  wabaId: string;
}) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/debug_token`);
  url.search = new URLSearchParams({
    input_token: input.accessToken,
    access_token: `${input.appId}|${input.appSecret}`,
  }).toString();
  const inspected = await metaJson(url, 'embedded_signup_token_inspection');
  const token = inspected?.data;
  if (!token || token.is_valid !== true) throw new Error('Meta WhatsApp token invalid');
  if (String(token.app_id ?? '') !== input.appId) throw new Error('Meta WhatsApp token app mismatch');

  const grantedScopes = getEffectiveGrantedScopes(token.scopes, token.granular_scopes);
  const missingScopes = WHATSAPP_EMBEDDED_SIGNUP_REQUIRED_SCOPES.filter(scope => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) throw new Error('Meta WhatsApp token missing required scopes');

  const granularScopes: MetaGranularScope[] = Array.isArray(token.granular_scopes) ? token.granular_scopes : [];
  const managementTargets = granularScopes
    .filter(item => item && typeof item === 'object' && item.scope === 'whatsapp_business_management')
    .flatMap(item => Array.isArray(item.target_ids) ? item.target_ids : [])
    .filter((target): target is string => typeof target === 'string');
  if (managementTargets.length > 0 && !managementTargets.includes(input.wabaId)) {
    throw new Error('Meta WhatsApp WABA is outside authorized granular scope');
  }

  const expiresAtSeconds = token.expires_at;
  const tokenExpiresAt = typeof expiresAtSeconds === 'number' && Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0
    ? new Date(expiresAtSeconds * 1000)
    : null;

  return { grantedScopes, tokenExpiresAt };
}

export async function validateWhatsAppWabaPhoneSelection(input: {
  accessToken: string;
  appSecret: string;
  wabaId: string;
  phoneNumberId: string;
}) {
  const proof = createAppSecretProof(input.accessToken, input.appSecret);
  const wabaUrl = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}`);
  wabaUrl.search = new URLSearchParams({ fields: 'id,name,currency,timezone_id', appsecret_proof: proof }).toString();
  const waba = await metaJson(wabaUrl, 'waba_validation', { accessToken: input.accessToken });
  if (String(waba?.id ?? '') !== input.wabaId) throw new Error('Meta WhatsApp WABA mismatch');

  const phonesUrl = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}/phone_numbers`);
  phonesUrl.search = new URLSearchParams({
    fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status',
    limit: '100',
    appsecret_proof: proof,
  }).toString();
  const phones = await metaJson(phonesUrl, 'waba_phone_numbers', { accessToken: input.accessToken });
  const phoneRaw = Array.isArray(phones?.data)
    ? phones.data.find((item: any) => String(item?.id ?? '') === input.phoneNumberId)
    : null;
  if (!phoneRaw) throw new Error('Meta WhatsApp phone is not part of authorized WABA');

  const phone: WhatsAppPhone = {
    id: input.phoneNumberId,
    displayPhoneNumber: typeof phoneRaw.display_phone_number === 'string' ? phoneRaw.display_phone_number : null,
    verifiedName: typeof phoneRaw.verified_name === 'string' ? phoneRaw.verified_name : null,
    qualityRating: typeof phoneRaw.quality_rating === 'string' ? phoneRaw.quality_rating : null,
    codeVerificationStatus: typeof phoneRaw.code_verification_status === 'string' ? phoneRaw.code_verification_status : null,
  };
  return {
    waba: { id: input.wabaId, name: typeof waba.name === 'string' ? waba.name : null },
    phone,
  };
}

export async function subscribeAppToWhatsAppWaba(input: { accessToken: string; appSecret: string; wabaId: string }) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}/subscribed_apps`);
  url.search = new URLSearchParams({ appsecret_proof: createAppSecretProof(input.accessToken, input.appSecret) }).toString();
  const data = await metaJson(url, 'subscribe_waba', { accessToken: input.accessToken, method: 'POST' });
  if (data?.success !== true && data?.success !== 'true') throw new Error('Meta WhatsApp subscribe_waba unsuccessful');
  return true;
}
