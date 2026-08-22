import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getActiveInstagramConnection, revokeInstagramConnection } from '@/lib/meta/instagram-connection';
import { getInstagramConnectionHealthForTenant } from '@/lib/meta/instagram-connection-health';
import { getInstagramRuntimeReadiness } from '@/lib/meta/instagram-runtime-readiness';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req: NextRequest, session) => {
  const [readiness, connection, health] = await Promise.all([
    getInstagramRuntimeReadiness(),
    getActiveInstagramConnection(session.tenantId),
    getInstagramConnectionHealthForTenant(session.tenantId),
  ]);
  return NextResponse.json({
    platformAvailable: readiness.platformConfigured,
    connectionAvailable: readiness.ready,
    connection,
    health,
  });
});

export const DELETE = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `instagram-disconnect:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const revoked = await revokeInstagramConnection({
    tenantId: session.tenantId,
    userId: session.userId,
  });
  return NextResponse.json({ revoked });
});
