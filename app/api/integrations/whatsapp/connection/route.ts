import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  isPlatformWhatsAppEmbeddedSignupAvailable,
  isPlatformWhatsAppRuntimeAvailable,
} from '@/lib/meta/platform-settings';
import {
  getWhatsAppConnectionHealthForTenant,
  getWhatsAppRegisteredAt,
} from '@/lib/meta/whatsapp-connection-health';

function toSafeConnection(connection: any | null, registeredAt: Date | null) {
  if (!connection) return null;
  return {
    status: connection.status,
    wabaName: connection.wabaName,
    displayPhoneNumber: connection.displayPhoneNumber,
    verifiedName: connection.verifiedName,
    qualityRating: connection.qualityRating,
    connectedAt: connection.connectedAt,
    systemUserAssignedAt: connection.systemUserAssignedAt,
    subscribedAt: connection.subscribedAt,
    lastValidatedAt: connection.lastValidatedAt,
    registeredAt,
  };
}

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [platformAvailable, runtimeAvailable, connection, health] = await Promise.all([
    isPlatformWhatsAppEmbeddedSignupAvailable(),
    isPlatformWhatsAppRuntimeAvailable(),
    prisma.tenantWhatsAppConnection.findFirst({
      where: { tenantId: session.tenantId },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        status: true,
        phoneNumberId: true,
        wabaName: true,
        displayPhoneNumber: true,
        verifiedName: true,
        qualityRating: true,
        connectedAt: true,
        systemUserAssignedAt: true,
        subscribedAt: true,
        lastValidatedAt: true,
      },
    }),
    getWhatsAppConnectionHealthForTenant(session.tenantId),
  ]);

  const registeredAt = connection?.status === 'connected'
    ? await getWhatsAppRegisteredAt({
        tenantId: session.tenantId,
        connectionId: connection.id,
        phoneNumberId: connection.phoneNumberId,
        connectedAt: connection.connectedAt,
      })
    : null;

  return NextResponse.json({
    platformAvailable,
    runtimeAvailable,
    connection: toSafeConnection(connection, registeredAt),
    health,
  });
});

export const DELETE = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-connection-disconnect:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: { tenantId: session.tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true },
  });
  if (!connection) return NextResponse.json({ disconnected: false });

  const now = new Date();
  await prisma.$transaction(async tx => {
    await tx.tenantWhatsAppConnection.update({
      where: { id: connection.id },
      data: { status: 'revoked', revokedAt: now },
    });
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'tenant_whatsapp_connection',
        entityId: connection.id,
        action: 'WHATSAPP_CONNECTION_REVOKED',
      },
    });
  });
  return NextResponse.json({ disconnected: true });
});
