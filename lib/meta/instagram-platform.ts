import 'server-only';

import { getPlatformMetaOAuthCredentials, isPlatformMetaBaseAvailable } from './platform-settings';

export const INSTAGRAM_OAUTH_CALLBACK_PATH = '/api/integrations/instagram/callback';

export function getInstagramOAuthRedirectUri() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${INSTAGRAM_OAUTH_CALLBACK_PATH}`;
}

export async function isPlatformInstagramLoginAvailable() {
  return isPlatformMetaBaseAvailable();
}

export async function getPlatformInstagramLoginCredentials() {
  const credentials = await getPlatformMetaOAuthCredentials();
  if (!credentials) return null;
  return {
    appId: credentials.appId,
    appSecret: credentials.appSecret,
  };
}
