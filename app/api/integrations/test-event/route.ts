import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { z } from 'zod';
import { logTrackingEvent } from '@/lib/tracking';
import { logPlatformAudit } from '@/lib/platform-audit';

const schema = z.object({ provider: z.enum(['meta','gtm','ga4','google_ads']), eventName: z.string().min(1).max(64) });

export const POST = withAuth(async (req, session) => {
  const rl = rateLimit({ key: `integrations-test:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  const eventId = crypto.randomUUID();
  await logTrackingEvent({ tenantId: session.tenantId, provider: parsed.data.provider, eventName: parsed.data.eventName, status: 'test', reason: 'test_event', triggeredById: session.userId, eventId });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'tracking', entityId: eventId, action: 'tracking.test_event_triggered', metadata: parsed.data });
  return NextResponse.json({ ok: true, eventId });
});
