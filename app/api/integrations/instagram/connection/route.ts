import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getActiveInstagramConnection, revokeInstagramConnection } from '@/lib/meta/instagram-connection';
import { isPlatformInstagramLoginAvailable } from '@/lib/meta/instagram-platform';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req: NextRequest, session) => {
  const [platformAvailable, connection] = await Promise.all([
    isPlatformInstagramLoginAvailable(),
    getActiveInstagramConnection(session.tenantId),
  ]);
  return NextResponse.json({ platformAvailable, connection });
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
