import 'server-only';

import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';

export type PlatformWhatsAppWebhookCredentials = {
  appSecret: string;
};

export async function getPlatformWhatsAppWebhookCredentials(): Promise<PlatformWhatsAppWebhookCredentials | null> {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: 'meta' },
    select: { appSecretEncrypted: true },
  });

  const appSecret = decryptIntegrationSecret(settings?.appSecretEncrypted);
  if (!appSecret) return null;
  return { appSecret };
}

export function getWhatsAppWebhookVerifyToken() {
  const value = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  return value || null;
}
