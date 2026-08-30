import 'server-only';

import { getEffectiveGrantedScopes, META_PLATFORM_GRAPH_API_VERSION } from './oauth';
import {
  WHATSAPP_PLATFORM_ADMIN_REQUIRED_SCOPES,
  WHATSAPP_SYSTEM_USER_REQUIRED_SCOPES,
} from './whatsapp';

const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;

type PlatformTokenPreflightInput = {
  accessToken: string;
  appId: string;
  appSecret: string;
  requiredScopes: readonly string[];
};

async function inspectPlatformSystemUserToken(input: PlatformTokenPreflightInput) {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/debug_token`);
  url.search = new URLSearchParams({ input_token: input.accessToken }).toString();

  // For platform-level preflight, use the app access token as the inspector.
  // This keeps the token being inspected separate from the credential that
  // authorizes /debug_token and avoids self-inspection failures from Meta.
  const appAccessToken = `${input.appId}|${input.appSecret}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: { Authorization: `Bearer ${appAccessToken}` },
    });
  } catch {
    throw new Error('Meta WhatsApp platform token inspection unavailable');
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Meta WhatsApp platform token inspection invalid response');
  }

  if (!response.ok || payload?.error) {
    console.error('Meta WhatsApp platform token inspection failed', {
      httpStatus: response.status,
      metaCode: payload?.error?.code,
      metaType: payload?.error?.type,
    });
    throw new Error('Meta WhatsApp platform token inspection failed');
  }

  const token = payload?.data;
  if (!token || token.is_valid !== true) throw new Error('Meta WhatsApp platform token invalid');
  if (String(token.app_id ?? '') !== input.appId) throw new Error('Meta WhatsApp platform token app mismatch');

  const grantedScopes = getEffectiveGrantedScopes(token.scopes, token.granular_scopes);
  const missingScopes = input.requiredScopes.filter(scope => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) throw new Error('Meta WhatsApp platform token missing required scopes');

  return { grantedScopes };
}

export async function validateWhatsAppPlatformAdminTokenForPreflight(input: {
  accessToken: string;
  appId: string;
  appSecret: string;
}) {
  return inspectPlatformSystemUserToken({
    ...input,
    requiredScopes: WHATSAPP_PLATFORM_ADMIN_REQUIRED_SCOPES,
  });
}

export async function validateWhatsAppPlatformRuntimeTokenForPreflight(input: {
  accessToken: string;
  appId: string;
  appSecret: string;
}) {
  return inspectPlatformSystemUserToken({
    ...input,
    requiredScopes: WHATSAPP_SYSTEM_USER_REQUIRED_SCOPES,
  });
}
