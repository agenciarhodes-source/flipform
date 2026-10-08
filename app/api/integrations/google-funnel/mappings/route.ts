import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { describeGoogleFunnelTransportForTenant, resolveGoogleFunnelTransportConfig } from '@/lib/tracking/google-data-manager';
import { listRecentGoogleConversionEvents } from '@/lib/tracking/google-funnel-outbox';
import {
  GOOGLE_FUNNEL_SCHEMA_PENDING_MESSAGE,
  createGoogleFunnelMapping,
  isGoogleFunnelSchemaPendingError,
  listGoogleFunnelMappings,
} from '@/lib/tracking/google-funnel-mappings';

export const dynamic = 'force-dynamic';

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  try {
    const [mappings, recentEvents, pipelines] = await Promise.all([
      listGoogleFunnelMappings(session.tenantId),
      listRecentGoogleConversionEvents(session.tenantId),
      prisma.pipeline.findMany({
        where: { tenantId: session.tenantId, isArchived: false },
        select: {
          id: true,
          name: true,
          stages: { where: { isArchived: false }, orderBy: { orderIndex: 'asc' }, select: { id: true, name: true, orderIndex: true } },
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);
    const transport = describeGoogleFunnelTransportForTenant(resolveGoogleFunnelTransportConfig(), session.tenantId);
    return NextResponse.json({ mappings, pipelines, recentEvents, transport });
  } catch (error) {
    if (isGoogleFunnelSchemaPendingError(error)) {
      return NextResponse.json({ error: GOOGLE_FUNNEL_SCHEMA_PENDING_MESSAGE }, { status: 503 });
    }
    console.error('google funnel mappings list error', error);
    return NextResponse.json({ error: 'Erro ao carregar o funil Google Ads.' }, { status: 500 });
  }
});

export const POST = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const rl = rateLimit({ key: `google-funnel-mappings-post:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  try {
    const body = await req.json().catch(() => null);
    const result = await createGoogleFunnelMapping({ tenantId: session.tenantId, userId: session.userId, body });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logPlatformAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'integration',
      entityId: result.mapping.id,
      action: 'integrations.google_funnel_mapping_created',
      metadata: { stageId: result.mapping.stageId, enabled: result.mapping.enabled },
    });
    return NextResponse.json({ ok: true, mapping: result.mapping });
  } catch (error) {
    if (isGoogleFunnelSchemaPendingError(error)) {
      return NextResponse.json({ error: GOOGLE_FUNNEL_SCHEMA_PENDING_MESSAGE }, { status: 503 });
    }
    console.error('google funnel mapping create error', error);
    return NextResponse.json({ error: 'Erro ao salvar o mapeamento.' }, { status: 500 });
  }
});
