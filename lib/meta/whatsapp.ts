import 'server-only';
import { createAppSecretProof, getEffectiveGrantedScopes, META_PLATFORM_GRAPH_API_VERSION } from './oauth';

const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;

// The short-lived OAuth user token returned by Embedded Signup is onboarding
// evidence. Meta's own Debug Token example shows whatsapp_business_management
// on this token; messaging is enforced on the long-lived System User token.
export const WHATSAPP_EMBEDDED_SIGNUP_REQUIRED_SCOPES = [
  'whatsapp_business_management',
] as const;

export const WHATSAPP_SYSTEM_USER_REQUIRED_SCOPES = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const;

type MetaGranularScope = { scope?: unknown; target_ids?: unknown };

type WhatsAppPhone = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
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
  return { accessToken: data.access_token as string };
}

async function validateWhatsAppTokenForWaba(input: {
  accessToken: string;
  debugAccessToken: string;
  appId: string;
  wabaId: string;
  requiredScopes: readonly string[];
}) {
  // Meta's Embedded Signup collection authorizes /debug_token with a System
  // User Access Token and passes the token being inspected only as input_token.
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/debug_token`);
  url.search = new URLSearchParams({ input_token: input.accessToken }).toString();
  const inspected = await metaJson(url, 'token_inspection', { accessToken: input.debugAccessToken });
  const token = inspected?.data;
  if (!token || token.is_valid !== true) throw new Error('Meta WhatsApp token invalid');
  if (String(token.app_id ?? '') !== input.appId) throw new Error('Meta WhatsApp token app mismatch');

  const grantedScopes = getEffectiveGrantedScopes(token.scopes, token.granular_scopes);
  const missingScopes = input.requiredScopes.filter(scope => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) throw new Error('Meta WhatsApp token missing required scopes');

  const granularScopes: MetaGranularScope[] = Array.isArray(token.granular_scopes) ? token.granular_scopes : [];
  const managementTargets = granularScopes
    .filter(item => item && typeof item === 'object' && item.scope === 'whatsapp_business_management')
    .flatMap(item => Array.isArray(item.target_ids) ? item.target_ids : [])
    .filter((target): target is string => typeof target === 'string');
  if (managementTargets.length > 0 && !managementTargets.includes(input.wabaId)) {
    throw new Error('Meta WhatsApp WABA is outside authorized granular scope');
  }

  return { grantedScopes };
}

export async function validateWhatsAppEmbeddedSignupToken(input: {
  accessToken: string;
  debugAccessToken: string;
  appId: string;
  wabaId: string;
}) {
  return validateWhatsAppTokenForWaba({
    ...input,
    requiredScopes: WHATSAPP_EMBEDDED_SIGNUP_REQUIRED_SCOPES,
  });
}

export async function validateWhatsAppSystemUserToken(input: {
  accessToken: string;
  debugAccessToken: string;
  appId: string;
  wabaId: string;
}) {
  return validateWhatsAppTokenForWaba({
    ...input,
    requiredScopes: WHATSAPP_SYSTEM_USER_REQUIRED_SCOPES,
  });
}

export async function assignSystemUserToWhatsAppWaba(input: {
  adminSystemUserAccessToken: string;
  appSecret: string;
  wabaId: string;
  systemUserId: string;
}) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}/assigned_users`);
  url.search = new URLSearchParams({
    user: input.systemUserId,
    tasks: JSON.stringify(['MANAGE']),
    appsecret_proof: createAppSecretProof(input.adminSystemUserAccessToken, input.appSecret),
  }).toString();
  const data = await metaJson(url, 'assign_system_user_to_waba', {
    accessToken: input.adminSystemUserAccessToken,
    method: 'POST',
  });
  if (data?.success !== true && data?.success !== 'true') {
    throw new Error('Meta WhatsApp assign_system_user_to_waba unsuccessful');
  }
}

export async function verifySystemUserAssignedToWhatsAppWaba(input: {
  adminSystemUserAccessToken: string;
  appSecret: string;
  wabaId: string;
  businessId: string;
  systemUserId: string;
}) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}/assigned_users`);
  url.search = new URLSearchParams({
    business: input.businessId,
    appsecret_proof: createAppSecretProof(input.adminSystemUserAccessToken, input.appSecret),
  }).toString();
  const data = await metaJson(url, 'verify_system_user_assignment', { accessToken: input.adminSystemUserAccessToken });
  return Array.isArray(data?.data)
    && data.data.some((item: any) => String(item?.id ?? '') === input.systemUserId);
}

export async function ensureSystemUserAssignedToWhatsAppWaba(input: {
  adminSystemUserAccessToken: string;
  appSecret: string;
  wabaId: string;
  businessId: string;
  systemUserId: string;
}) {
  const assigned = await verifySystemUserAssignedToWhatsAppWaba(input);
  if (!assigned) await assignSystemUserToWhatsAppWaba(input);
  const verified = assigned || await verifySystemUserAssignedToWhatsAppWaba(input);
  if (!verified) throw new Error('Meta WhatsApp system user assignment not found');
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
    fields: 'id,display_phone_number,verified_name,quality_rating',
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
}
