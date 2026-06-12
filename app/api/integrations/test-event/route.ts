import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { z } from 'zod';
import { logTrackingEvent } from '@/lib/tracking';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { sendMetaCapiEvent } from '@/lib/tracking/meta-capi';

const schema = z.object({ provider: z.enum(['meta','gtm','ga4','google_ads']), eventName: z.string().min(1).max(64).default('Lead') });

export const POST = withPermission('INTEGRATIONS_TEST', async (req, session) => {
  const rl = rateLimit({ key: `integrations-test:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  const eventId = crypto.randomUUID();
  let status = 'sent';
  let reason: string | null = 'test_event';
  try {
    const settings = await prisma.tenantIntegrationSettings.findUnique({ where: { tenantId: session.tenantId } });
    if (parsed.data.provider === 'meta') {
      if (!settings?.metaPixelEnabled || !settings.metaPixelId || !settings.metaAccessTokenEncrypted) {
        status = 'skipped';
        reason = 'Meta desativado ou sem Pixel/Token configurado';
      } else {
        const token = decryptIntegrationSecret(settings.metaAccessTokenEncrypted);
        if (!token) throw new Error('Token Meta indisponível para descriptografia');
        const result = await sendMetaCapiEvent({ pixelId: settings.metaPixelId, accessToken: token, eventName: parsed.data.eventName, eventId, actionSource: 'system_generated', testEventCode: settings.metaTestEventCode, customData: { content_name: 'FlipForm test event', currency: 'BRL' } });
        if (!result.ok) throw new Error(result.reason || 'Falha ao enviar evento Meta');
        reason = 'Evento de teste enviado para Meta';
      }
    } else {
      reason = 'Evento de teste preparado; disparo server-side do provider será incremental';
    }
  } catch (error: any) {
    status = 'failed';
    reason = error?.message || 'Falha ao enviar evento de teste';
  }
  await logTrackingEvent({ tenantId: session.tenantId, provider: parsed.data.provider, eventName: parsed.data.eventName, status, reason, triggeredById: session.userId, eventId });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'tracking', entityId: eventId, action: 'tracking.test_event_triggered', metadata: { provider: parsed.data.provider, eventName: parsed.data.eventName, status } });
  const httpStatus = status === 'failed' ? 502 : 200;
  return NextResponse.json({ ok: status !== 'failed', status, reason, eventId }, { status: httpStatus });
});
