import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const SAFE_CONNECTION_SELECT = {
  id: true,
  status: true,
  instagramUserId: true,
  username: true,
  tokenExpiresAt: true,
  connectedAt: true,
  lastValidatedAt: true,
  revokedAt: true,
} as const;

export async function getActiveInstagramConnection(tenantId: string) {
  const connection = await prisma.tenantInstagramConnection.findFirst({
    where: { tenantId, status: 'connected' },
    orderBy: { connectedAt: 'desc' },
    select: SAFE_CONNECTION_SELECT,
  });
  if (!connection) return null;

  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= Date.now()) {
    return { ...connection, status: 'expired' as const };
  }
  return connection;
}

async function lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public.tenants WHERE id = ${tenantId} FOR UPDATE
  `;
  if (!rows[0]) throw new Error('TENANT_NOT_FOUND');
}

export async function persistInstagramConnection(input: {
  tenantId: string;
  instagramUserId: string;
  username: string;
  accessTokenEncrypted: string;
  tokenExpiresAt: Date | null;
  connectedById: string;
}) {
  const now = new Date();
  return prisma.$transaction(async tx => {
    await lockTenant(tx, input.tenantId);

    const conflict = await tx.tenantInstagramConnection.findFirst({
      where: {
        instagramUserId: input.instagramUserId,
        tenantId: { not: input.tenantId },
      },
      select: { id: true },
    });
    if (conflict) throw new Error('INSTAGRAM_ACCOUNT_BOUND_TO_OTHER_TENANT');

    await tx.tenantInstagramConnection.updateMany({
      where: {
        tenantId: input.tenantId,
        status: 'connected',
        instagramUserId: { not: input.instagramUserId },
      },
      data: { status: 'revoked', revokedAt: now },
    });

    const existing = await tx.tenantInstagramConnection.findUnique({
      where: { instagramUserId: input.instagramUserId },
      select: { id: true, tenantId: true },
    });
    if (existing && existing.tenantId !== input.tenantId) {
      throw new Error('INSTAGRAM_ACCOUNT_BOUND_TO_OTHER_TENANT');
    }

    const connection = existing
      ? await tx.tenantInstagramConnection.update({
          where: { id: existing.id },
          data: {
            status: 'connected',
            username: input.username,
            accessTokenEncrypted: input.accessTokenEncrypted,
            tokenExpiresAt: input.tokenExpiresAt,
            connectedById: input.connectedById,
            connectedAt: now,
            lastValidatedAt: now,
            revokedAt: null,
          },
          select: { id: true, connectedAt: true },
        })
      : await tx.tenantInstagramConnection.create({
          data: {
            tenantId: input.tenantId,
            status: 'connected',
            instagramUserId: input.instagramUserId,
            username: input.username,
            accessTokenEncrypted: input.accessTokenEncrypted,
            tokenExpiresAt: input.tokenExpiresAt,
            connectedById: input.connectedById,
            connectedAt: now,
            lastValidatedAt: now,
          },
          select: { id: true, connectedAt: true },
        });

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.connectedById,
        entityType: 'tenant_instagram_connection',
        entityId: connection.id,
        action: 'INSTAGRAM_CONNECTION_CONNECTED',
        metadata: {
          instagramUserId: input.instagramUserId,
          username: input.username,
          credentialMode: 'instagram_user_access_token',
        },
      },
    });

    return connection;
  });
}

export async function revokeInstagramConnection(input: { tenantId: string; userId: string }) {
  const now = new Date();
  return prisma.$transaction(async tx => {
    await lockTenant(tx, input.tenantId);
    const connection = await tx.tenantInstagramConnection.findFirst({
      where: { tenantId: input.tenantId, status: 'connected' },
      orderBy: { connectedAt: 'desc' },
      select: { id: true, instagramUserId: true },
    });
    if (!connection) return false;

    await tx.tenantInstagramConnection.update({
      where: { id: connection.id },
      data: { status: 'revoked', revokedAt: now },
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        entityType: 'tenant_instagram_connection',
        entityId: connection.id,
        action: 'INSTAGRAM_CONNECTION_REVOKED',
        metadata: { instagramUserId: connection.instagramUserId },
      },
    });
    return true;
  });
}
