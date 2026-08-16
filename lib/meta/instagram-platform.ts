import 'server-only';

import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { PLATFORM_META_SETTINGS_ID } from './platform-settings';

export const INSTAGRAM_OAUTH_CALLBACK_PATH = '/api/integrations/instagram/callback';

export function getInstagramOAuthRedirectUri() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${INSTAGRAM_OAUTH_CALLBACK_PATH}`;
}

async function getInstagramPlatformSettings() {
  return prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: {
      instagramAppId: true,
      instagramAppSecretEncrypted: true,
    },
  });
}

export async function isPlatformInstagramLoginAvailable() {
  const settings = await getInstagramPlatformSettings();
  return Boolean(settings?.instagramAppId && settings.instagramAppSecretEncrypted);
}

export async function getPlatformInstagramLoginCredentials() {
  const settings = await getInstagramPlatformSettings();
  const appSecret = decryptIntegrationSecret(settings?.instagramAppSecretEncrypted);
  if (!settings?.instagramAppId || !appSecret) return null;
  return {
    appId: settings.instagramAppId,
    appSecret,
  };
}
