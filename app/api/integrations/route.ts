import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { buildIntegrationSettingsData, integrationsSchema, serializeIntegrationSettings } from '@/lib/tracking';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const settings = await prisma.tenantIntegrationSettings.findUnique({ where: { tenantId: session.tenantId } });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: session.tenantId, action: 'integrations.settings_viewed' });
  return NextResponse.json({ settings: serializeIntegrationSettings(settings) });
});

export const PUT = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const rl = rateLimit({ key: `integrations-put:${session.tenantId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const body = await req.json();
  const parsed = integrationsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });

  const existing = await prisma.tenantIntegrationSettings.findUnique({ where: { tenantId: session.tenantId } });
  let data: Record<string, unknown>;
  try {
    data = buildIntegrationSettingsData(parsed.data, existing);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível proteger os tokens.' }, { status: 400 });
  }

  const settings = await prisma.tenantIntegrationSettings.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, ...data } as any,
    update: data,
  });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: settings.id, action: 'integrations.settings_updated', metadata: { metaPixelEnabled: parsed.data.metaPixelEnabled, gtmEnabled: parsed.data.gtmEnabled, ga4Enabled: parsed.data.ga4Enabled, googleAdsEnabled: parsed.data.googleAdsEnabled } });
  return NextResponse.json({ ok: true, settings: serializeIntegrationSettings(settings) });
});
