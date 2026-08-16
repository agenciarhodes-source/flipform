import 'server-only';

import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';

export type PlatformWhatsAppSendCredentials = {
  systemUserAccessToken: string;
};

export async function getPlatformWhatsAppSendCredentials(): Promise<PlatformWhatsAppSendCredentials | null> {
  const settings = await prisma.platformMetaSettings.findUnique({
    where: { id: 'meta' },
    select: { whatsappSystemUserAccessTokenEncrypted: true },
  });

  const systemUserAccessToken = decryptIntegrationSecret(settings?.whatsappSystemUserAccessTokenEncrypted);
  if (!systemUserAccessToken) return null;
  return { systemUserAccessToken };
}
