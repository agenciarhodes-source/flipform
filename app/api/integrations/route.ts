import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { integrationsSchema } from '@/lib/tracking';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';

export const GET = withAuth(async (_req, session) => {
  const settings = await prisma.tenantIntegrationSettings.findUnique({ where: { tenantId: session.tenantId } });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: session.tenantId, action: 'integrations.settings_viewed' });
  return NextResponse.json({ settings: settings || null });
});

export const PUT = withAuth(async (req, session) => {
  const rl = rateLimit({ key: `integrations-put:${session.tenantId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const body = await req.json();
  const parsed = integrationsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });
  const d = parsed.data;
  const settings = await prisma.tenantIntegrationSettings.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, ...d },
    update: { ...d },
  });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: settings.id, action: 'integrations.settings_updated', metadata: { metaPixelEnabled: d.metaPixelEnabled, gtmEnabled: d.gtmEnabled, ga4Enabled: d.ga4Enabled, googleAdsEnabled: d.googleAdsEnabled } });
  return NextResponse.json({ ok: true, settings });
});
