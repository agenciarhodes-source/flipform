import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { replayFailedMetaEvents } from '@/lib/tracking';

/** Resends the Meta events that failed in the last days, with their original time. */
export const POST = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = await rateLimit({ key: `meta-replay:${session.tenantId}:${getClientIp(req)}`, limit: 3, windowMs: 10 * 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Aguarde alguns minutos antes de reenviar de novo.' }, { status: 429 });
  const summary = await replayFailedMetaEvents(session.tenantId);
  if (summary.blocked) {
    return NextResponse.json({ error: 'A Meta ainda não está pronta para receber: confira o Pixel e o Token da API de Conversões.', summary }, { status: 409 });
  }
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'integration', entityId: 'meta', action: 'integrations.meta_events_replayed',
    metadata: summary,
  });
  return NextResponse.json({ ok: true, summary });
});
