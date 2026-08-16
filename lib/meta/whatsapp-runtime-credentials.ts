import 'server-only';

import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';

export type PlatformWhatsAppCloudRuntimeCredentials = {
  appId: string;
  appSecret: string;
  systemUserAccessToken: string;
};

export async function getPlatformWhatsAppCloudRuntimeCredentials(): Promise<PlatformWhatsAppCloudRuntimeCredentials | null> {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: 'meta' },
    select: {
      appId: true,
      appSecretEncrypted: true,
      whatsappSystemUserAccessTokenEncrypted: true,
    },
  });

  const appSecret = decryptIntegrationSecret(settings?.appSecretEncrypted);
  const systemUserAccessToken = decryptIntegrationSecret(settings?.whatsappSystemUserAccessTokenEncrypted);

  if (!settings?.appId || !appSecret || !systemUserAccessToken) return null;

  return {
    appId: settings.appId,
    appSecret,
    systemUserAccessToken,
  };
}

export function getWhatsAppWebhookVerifyToken() {
  const value = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  return value || null;
}
