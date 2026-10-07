import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logPlatformAudit } from '@/lib/platform-audit';
import {
  GOOGLE_FUNNEL_SCHEMA_PENDING_MESSAGE,
  archiveGoogleFunnelMapping,
  isGoogleFunnelSchemaPendingError,
  updateGoogleFunnelMapping,
} from '@/lib/tracking/google-funnel-mappings';

export const dynamic = 'force-dynamic';

export const PUT = withPermission('INTEGRATIONS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `google-funnel-mappings-put:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  try {
    const body = await req.json().catch(() => null);
    const result = await updateGoogleFunnelMapping({
      tenantId: session.tenantId,
      userId: session.userId,
      mappingId: ctx.params.id,
      body,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logPlatformAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'integration',
      entityId: result.mapping.id,
      action: 'integrations.google_funnel_mapping_updated',
      metadata: { stageId: result.mapping.stageId, enabled: result.mapping.enabled },
    });
    return NextResponse.json({ ok: true, mapping: result.mapping });
  } catch (error) {
    if (isGoogleFunnelSchemaPendingError(error)) {
      return NextResponse.json({ error: GOOGLE_FUNNEL_SCHEMA_PENDING_MESSAGE }, { status: 503 });
    }
    console.error('google funnel mapping update error', error);
    return NextResponse.json({ error: 'Erro ao salvar o mapeamento.' }, { status: 500 });
  }
});

export const DELETE = withPermission('INTEGRATIONS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `google-funnel-mappings-delete:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  try {
    const result = await archiveGoogleFunnelMapping({
      tenantId: session.tenantId,
      userId: session.userId,
      mappingId: ctx.params.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logPlatformAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'integration',
      entityId: ctx.params.id,
      action: 'integrations.google_funnel_mapping_archived',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isGoogleFunnelSchemaPendingError(error)) {
      return NextResponse.json({ error: GOOGLE_FUNNEL_SCHEMA_PENDING_MESSAGE }, { status: 503 });
    }
    console.error('google funnel mapping archive error', error);
    return NextResponse.json({ error: 'Erro ao remover o mapeamento.' }, { status: 500 });
  }
});
