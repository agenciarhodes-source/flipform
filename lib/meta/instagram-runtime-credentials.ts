import 'server-only';

import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { PLATFORM_META_SETTINGS_ID } from './platform-settings';

export type PlatformInstagramWebhookCredentials = {
  appSecret: string;
};

export async function getPlatformInstagramWebhookCredentials(): Promise<PlatformInstagramWebhookCredentials | null> {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: PLATFORM_META_SETTINGS_ID },
    select: { instagramAppSecretEncrypted: true },
  });

  const appSecret = decryptIntegrationSecret(settings?.instagramAppSecretEncrypted);
  if (!appSecret) return null;
  return { appSecret };
}

export function getInstagramWebhookVerifyToken() {
  const value = process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
  return value || null;
}
