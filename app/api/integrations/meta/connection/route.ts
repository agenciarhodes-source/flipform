import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { isPlatformMetaBusinessLoginAvailable } from '@/lib/meta/platform-settings';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

type MetaAuthorizationMode = 'client_authorized' | 'platform_managed';

async function getAuthorizationMode(connectionId?: string | null): Promise<MetaAuthorizationMode> {
  if (!connectionId) return 'client_authorized';
  const audit = await prisma.auditLog.findFirst({
    where: {
      entityType: 'tenant_meta_connection',
      entityId: connectionId,
      action: { in: ['META_PLATFORM_AUTHORIZATION_CONNECTED', 'META_CLIENT_AUTHORIZATION_CONNECTED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { action: true },
  });
  return audit?.action === 'META_PLATFORM_AUTHORIZATION_CONNECTED' ? 'platform_managed' : 'client_authorized';
}

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [businessLoginAvailable, connection] = await Promise.all([
    isPlatformMetaBusinessLoginAvailable(),
    prisma.tenantMetaConnection.findFirst({
      where: { tenantId: session.tenantId },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        status: true,
        metaUserName: true,
        connectedAt: true,
        tokenExpiresAt: true,
        grantedScopes: true,
        metaBusinessId: true,
        metaBusinessName: true,
        metaAdAccountId: true,
        metaAdAccountName: true,
        metaPixelId: true,
        metaPixelName: true,
        assetsSelectedAt: true,
      },
    }),
  ]);
  const authorizationMode = await getAuthorizationMode(connection?.id);
  const managedByPlatform = authorizationMode === 'platform_managed';
  let status = connection?.status ?? null;
  if (status === 'authorized' && connection?.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) status = 'expired';
  return NextResponse.json({
    platformAvailable: businessLoginAvailable && !managedByPlatform,
    authorizationMode,
    managedByPlatform,
    tenantCanManageAuthorization: !managedByPlatform,
    status,
    metaUserName: connection?.metaUserName ?? null,
    connectedAt: connection?.connectedAt ?? null,
    tokenExpiresAt: connection?.tokenExpiresAt ?? null,
    grantedScopes: connection?.grantedScopes ?? [],
    assetSelection: connection?.metaAdAccountId && connection.metaPixelId ? {
      businessId: connection.metaBusinessId,
      businessName: connection.metaBusinessName,
      adAccountId: connection.metaAdAccountId,
      adAccountName: connection.metaAdAccountName,
      pixelId: connection.metaPixelId,
      pixelName: connection.metaPixelName,
      selectedAt: connection.assetsSelectedAt,
    } : null,
  });
});

export const DELETE = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `meta-connection-disconnect:${session.tenantId}:${getClientIp(req)}`, limit: 10, windowMs: 10 * 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas alterações na conexão Meta. Tente novamente em instantes.' }, { status: 429 });

  const connection = await prisma.tenantMetaConnection.findFirst({
    where: { tenantId: session.tenantId, status: 'authorized' },
    orderBy: { connectedAt: 'desc' },
    select: { id: true },
  });
  if (connection && await getAuthorizationMode(connection.id) === 'platform_managed') {
    return NextResponse.json({
      error: 'Esta conexão Meta é gerenciada pela plataforma e só pode ser alterada pelo administrador do FlipForm.',
      code: 'META_CONNECTION_PLATFORM_MANAGED',
    }, { status: 403 });
  }

  const now = new Date();
  const result = await prisma.tenantMetaConnection.updateMany({
    where: { tenantId: session.tenantId, status: 'authorized' },
    data: { status: 'revoked', revokedAt: now },
  });
  return NextResponse.json({ disconnected: result.count > 0 });
});
