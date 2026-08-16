import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isPlatformWhatsAppEmbeddedSignupAvailable } from '@/lib/meta/platform-settings';

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
    registeredAt,
  };
}

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [platformAvailable, connection] = await Promise.all([
    isPlatformWhatsAppEmbeddedSignupAvailable(),
    prisma.tenantWhatsAppConnection.findFirst({
      where: { tenantId: session.tenantId },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        status: true,
        wabaName: true,
        displayPhoneNumber: true,
        verifiedName: true,
        qualityRating: true,
        connectedAt: true,
        systemUserAssignedAt: true,
        subscribedAt: true,
      },
    }),
  ]);

  let registeredAt: Date | null = null;
  if (connection?.status === 'connected') {
    const registrationAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId: session.tenantId,
        entityType: 'tenant_whatsapp_connection',
        entityId: connection.id,
        action: 'WHATSAPP_PHONE_REGISTERED',
        // connectedAt is reset on every Embedded Signup completion, including
        // when a historical row is reused for another phone in the same WABA.
        // This prevents a previous phone registration from being shown as current.
        createdAt: { gte: connection.connectedAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    registeredAt = registrationAudit?.createdAt || null;
  }

  return NextResponse.json({ platformAvailable, connection: toSafeConnection(connection, registeredAt) });
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
