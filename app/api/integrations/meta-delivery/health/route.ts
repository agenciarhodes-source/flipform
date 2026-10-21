import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { META_REPLAY_MAX_AGE_MS } from '@/lib/tracking/replay-rules';

const DAY_MS = 86_400_000;

/**
 * Whether events can keep reaching Meta: the 60-day connection, the permanent Conversions API
 * token, and the events that failed in the last days (which can still be resent).
 */
export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const now = new Date();
  const [connection, settings, failed, lastSent] = await Promise.all([
    prisma.tenantMetaConnection.findFirst({
      where: { tenantId: session.tenantId, status: 'authorized' },
      orderBy: { connectedAt: 'desc' },
      select: { tokenExpiresAt: true, metaPixelId: true },
    }),
    prisma.tenantIntegrationSettings.findUnique({
      where: { tenantId: session.tenantId },
      select: { metaPixelEnabled: true, metaPixelId: true, metaAccessTokenEncrypted: true },
    }),
    prisma.trackingEventLog.count({
      where: { tenantId: session.tenantId, provider: 'meta', status: 'failed', createdAt: { gte: new Date(now.getTime() - META_REPLAY_MAX_AGE_MS) } },
    }),
    prisma.trackingEventLog.findFirst({
      where: { tenantId: session.tenantId, provider: 'meta', status: 'sent' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  const expiresAt = connection?.tokenExpiresAt || null;
  const connectionDaysLeft = expiresAt ? Math.floor((expiresAt.getTime() - now.getTime()) / DAY_MS) : null;
  const hasPermanentToken = Boolean(settings?.metaPixelEnabled && settings.metaPixelId && settings.metaAccessTokenEncrypted);
  const connectionUsable = Boolean(connection?.metaPixelId) && (!expiresAt || expiresAt > now);
  const level = hasPermanentToken ? 'ok'
    : !connectionUsable ? 'blocked'
      : connectionDaysLeft !== null && connectionDaysLeft <= 7 ? 'expiring' : 'temporary';
  return NextResponse.json({
    level,
    hasPermanentToken,
    connectionExpiresAt: expiresAt,
    connectionDaysLeft,
    failedRecent: failed,
    lastSentAt: lastSent?.createdAt || null,
  });
});
