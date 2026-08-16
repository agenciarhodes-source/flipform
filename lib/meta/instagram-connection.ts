import 'server-only';

import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type DbClient = Prisma.TransactionClient | typeof prisma;

type InstagramConnectionRow = {
  id: string;
  tenantId: string;
  status: string;
  instagramUserId: string;
  username: string | null;
  tokenExpiresAt: Date | null;
  connectedAt: Date;
  lastValidatedAt: Date | null;
  revokedAt: Date | null;
};

export type SafeInstagramConnection = Omit<InstagramConnectionRow, 'tenantId'>;

const CONNECTION_SELECT = `
  id,
  tenant_id AS "tenantId",
  status,
  instagram_user_id AS "instagramUserId",
  username,
  token_expires_at AS "tokenExpiresAt",
  connected_at AS "connectedAt",
  last_validated_at AS "lastValidatedAt",
  revoked_at AS "revokedAt"
`;

export async function getActiveInstagramConnection(tenantId: string): Promise<SafeInstagramConnection | null> {
  const rows = await prisma.$queryRawUnsafe<InstagramConnectionRow[]>(
    `SELECT ${CONNECTION_SELECT}
       FROM tenant_instagram_connections
      WHERE tenant_id = $1 AND status = 'connected'
      ORDER BY connected_at DESC
      LIMIT 1`,
    tenantId,
  );
  const row = rows[0];
  if (!row) return null;
  const { tenantId: _tenantId, ...safe } = row;
  return safe;
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

    const conflict = await tx.$queryRaw<Array<{ tenantId: string }>>`
      SELECT tenant_id AS "tenantId"
        FROM tenant_instagram_connections
       WHERE instagram_user_id = ${input.instagramUserId}
         AND tenant_id <> ${input.tenantId}
       LIMIT 1
    `;
    if (conflict[0]) throw new Error('INSTAGRAM_ACCOUNT_BOUND_TO_OTHER_TENANT');

    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
        FROM tenant_instagram_connections
       WHERE tenant_id = ${input.tenantId}
         AND instagram_user_id = ${input.instagramUserId}
       LIMIT 1
    `;
    const connectionId = existing[0]?.id || randomUUID();

    await tx.$executeRaw`
      UPDATE tenant_instagram_connections
         SET status = 'revoked', revoked_at = ${now}, updated_at = ${now}
       WHERE tenant_id = ${input.tenantId}
         AND status = 'connected'
         AND instagram_user_id <> ${input.instagramUserId}
    `;

    if (existing[0]) {
      await tx.$executeRaw`
        UPDATE tenant_instagram_connections
           SET status = 'connected',
               username = ${input.username},
               access_token_encrypted = ${input.accessTokenEncrypted},
               token_expires_at = ${input.tokenExpiresAt},
               connected_by_id = ${input.connectedById},
               connected_at = ${now},
               last_validated_at = ${now},
               revoked_at = NULL,
               updated_at = ${now}
         WHERE id = ${connectionId}
           AND tenant_id = ${input.tenantId}
      `;
    } else {
      await tx.$executeRaw`
        INSERT INTO tenant_instagram_connections (
          id, tenant_id, status, instagram_user_id, username,
          access_token_encrypted, token_expires_at, connected_by_id,
          connected_at, last_validated_at, created_at, updated_at
        ) VALUES (
          ${connectionId}, ${input.tenantId}, 'connected', ${input.instagramUserId}, ${input.username},
          ${input.accessTokenEncrypted}, ${input.tokenExpiresAt}, ${input.connectedById},
          ${now}, ${now}, ${now}, ${now}
        )
      `;
    }

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.connectedById,
        entityType: 'tenant_instagram_connection',
        entityId: connectionId,
        action: 'INSTAGRAM_CONNECTION_CONNECTED',
        metadata: {
          instagramUserId: input.instagramUserId,
          username: input.username,
          credentialMode: 'instagram_user_access_token',
        },
      },
    });

    return { id: connectionId, connectedAt: now };
  });
}

export async function revokeInstagramConnection(input: { tenantId: string; userId: string }) {
  const now = new Date();
  return prisma.$transaction(async tx => {
    await lockTenant(tx, input.tenantId);
    const rows = await tx.$queryRaw<Array<{ id: string; instagramUserId: string }>>`
      SELECT id, instagram_user_id AS "instagramUserId"
        FROM tenant_instagram_connections
       WHERE tenant_id = ${input.tenantId}
         AND status = 'connected'
       ORDER BY connected_at DESC
       LIMIT 1
    `;
    const connection = rows[0];
    if (!connection) return false;

    await tx.$executeRaw`
      UPDATE tenant_instagram_connections
         SET status = 'revoked', revoked_at = ${now}, updated_at = ${now}
       WHERE id = ${connection.id}
         AND tenant_id = ${input.tenantId}
    `;
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
