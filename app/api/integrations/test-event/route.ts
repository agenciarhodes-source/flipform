import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { z } from 'zod';
import { logTrackingEvent } from '@/lib/tracking';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';
import { resolveMetaRuntimeConfig } from '@/lib/meta/runtime';
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
      const metaRuntime = await resolveMetaRuntimeConfig({ tenantId: session.tenantId, legacySettings: settings });
      if (!metaRuntime.capiEnabled || !metaRuntime.pixelId) {
        status = 'skipped';
        reason = `Meta CAPI desativado ou sem Pixel/Dataset utilizável (${metaRuntime.source})`;
      } else if (!metaRuntime.accessToken) {
        status = 'failed';
        reason = `Token Meta indisponível para envio CAPI (${metaRuntime.source})`;
      } else {
        const result = await sendMetaCapiEvent({
          pixelId: metaRuntime.pixelId,
          accessToken: metaRuntime.accessToken,
          eventName: parsed.data.eventName,
          eventId,
          actionSource: 'system_generated',
          testEventCode: metaRuntime.testEventCode,
          customData: { content_name: 'FlipForm test event', currency: 'BRL' },
        });
        if (!result.ok) throw new Error(result.reason || 'Falha ao enviar evento Meta');
        reason = `Evento de teste enviado para Meta (${metaRuntime.source})`;
      }
    } else if (parsed.data.provider === 'google_ads') {
      if (!settings?.googleAdsEnabled || !settings.googleAdsId || !settings.googleAdsLabel) {
        status = 'skipped';
        reason = 'Google Ads desativado ou sem Conversion ID/Label configurado';
      } else {
        status = 'not_dispatched';
        reason = 'Google Ads server-side ainda não possui transporte implementado; nenhum evento de teste foi enviado.';
      }
    } else if (parsed.data.provider === 'ga4') {
      if (!settings?.ga4Enabled || !settings.ga4MeasurementId || !settings.ga4ApiSecretEncrypted) {
        status = 'skipped';
        reason = 'GA4 desativado ou sem Measurement ID/API Secret configurado';
      } else {
        status = 'not_dispatched';
        reason = 'GA4 Measurement Protocol ainda não possui transporte implementado; nenhum evento de teste foi enviado.';
      }
    } else if (parsed.data.provider === 'gtm') {
      if (!settings?.gtmEnabled || !settings.gtmContainerId) {
        status = 'skipped';
        reason = 'GTM desativado ou sem Container ID configurado';
      } else {
        status = 'not_dispatched';
        reason = 'GTM é executado no navegador dos formulários; este teste server-side não envia evento ao container.';
      }
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
