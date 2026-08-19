import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateInstagramConnectionHealth } from '@/lib/meta/instagram-connection-health';

export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `instagram-connection-health:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 6,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const health = await validateInstagramConnectionHealth({
      tenantId: session.tenantId,
      userId: session.userId,
    });
    return NextResponse.json({ health });
  } catch (error) {
    console.error('Instagram connection health validation failed', {
      tenantId: session.tenantId,
      userId: session.userId,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível verificar a conexão do Instagram agora.' }, { status: 500 });
  }
});
