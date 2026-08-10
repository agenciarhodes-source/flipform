import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { isPlatformMetaAvailable } from '@/lib/meta/platform-settings';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [platformAvailable, connection] = await Promise.all([
    isPlatformMetaAvailable(),
    prisma.tenantMetaConnection.findFirst({ where: { tenantId: session.tenantId }, orderBy: { connectedAt: 'desc' }, select: { status: true, metaUserName: true, connectedAt: true, tokenExpiresAt: true, grantedScopes: true } }),
  ]);
  let status = connection?.status ?? null;
  if (status === 'authorized' && connection?.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) status = 'expired';
  return NextResponse.json({ platformAvailable, status, metaUserName: connection?.metaUserName ?? null, connectedAt: connection?.connectedAt ?? null, tokenExpiresAt: connection?.tokenExpiresAt ?? null, grantedScopes: connection?.grantedScopes ?? [] });
});
