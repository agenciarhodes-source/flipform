import 'server-only';

import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';

const INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION = 'INSTAGRAM_WEBHOOK_SUBSCRIBED';

export type InstagramSendConnection = {
  id: string;
  tenantId: string;
  instagramUserId: string;
  accessToken: string;
  connectedAt: Date;
};

export async function getInstagramSendConnection(tenantId: string): Promise<InstagramSendConnection | null> {
  const connection = await prisma.tenantInstagramConnection.findFirst({
    where: { tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: {
      id: true,
      tenantId: true,
      instagramUserId: true,
      accessTokenEncrypted: true,
      tokenExpiresAt: true,
      connectedAt: true,
    },
  });
  if (!connection) return null;
  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= Date.now()) return null;

  const webhookSubscription = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      entityType: 'tenant_instagram_connection',
      entityId: connection.id,
      action: INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION,
      createdAt: { gte: connection.connectedAt },
    },
    select: { id: true },
  });
  if (!webhookSubscription) return null;

  const accessToken = decryptIntegrationSecret(connection.accessTokenEncrypted);
  if (!accessToken) return null;

  return {
    id: connection.id,
    tenantId: connection.tenantId,
    instagramUserId: connection.instagramUserId,
    accessToken,
    connectedAt: connection.connectedAt,
  };
}
