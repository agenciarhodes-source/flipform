import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { isPlatformMetaBusinessLoginAvailable } from '@/lib/meta/platform-settings';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [platformAvailable, connection] = await Promise.all([
    isPlatformMetaBusinessLoginAvailable(),
    prisma.tenantMetaConnection.findFirst({
      where: { tenantId: session.tenantId },
      orderBy: { connectedAt: 'desc' },
      select: {
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
  let status = connection?.status ?? null;
  if (status === 'authorized' && connection?.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) status = 'expired';
  return NextResponse.json({
    platformAvailable,
    status,
    metaUserName: connection?.metaUserName ?? null,
    connectedAt: connection?.connectedAt ?? null,
    tokenExpiresAt: connection?.tokenExpiresAt ?? null,
    grantedScopes: connection?.grantedScopes ?? [],
    assetSelection: connection?.metaBusinessId && connection.metaAdAccountId && connection.metaPixelId ? {
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
