import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { z } from 'zod';
import { logPlatformAudit } from '@/lib/platform-audit';

const schema = z.array(z.object({ id: z.string().optional(), stageId: z.string(), pipelineId: z.string().optional().nullable(), provider: z.enum(['meta','gtm','ga4','google_ads']), eventName: z.string().min(1).max(64), customEventName: z.string().max(64).optional().nullable(), enabled: z.boolean().default(true) }));

export const GET = withAuth(async (_req, session) => {
  const events = await prisma.kanbanStageTrackingEvent.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ events });
});

export const PUT = withAuth(async (req, session) => {
  const rl = rateLimit({ key: `integrations-kanban:${session.tenantId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    await tx.kanbanStageTrackingEvent.deleteMany({ where: { tenantId: session.tenantId } });
    if (parsed.data.length) {
      await tx.kanbanStageTrackingEvent.createMany({ data: parsed.data.map((e) => ({ tenantId: session.tenantId, stageId: e.stageId, pipelineId: e.pipelineId || null, provider: e.provider, eventName: e.eventName, customEventName: e.customEventName || null, enabled: e.enabled })) });
    }
  });

  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: session.tenantId, action: 'integrations.kanban_event_mapping_updated' });
  return NextResponse.json({ ok: true });
});
