import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { kanbanEventSchema, toPrismaDecimal } from '@/lib/tracking';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';

function serializeEvent(event: any) {
  return { ...event, conversionValue: event.conversionValue === null || event.conversionValue === undefined ? null : Number(event.conversionValue) };
}

export const PUT = withPermission('INTEGRATIONS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `integrations-events-put:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const existing = await prisma.kanbanStageTrackingEvent.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
  const parsed = kanbanEventSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });
  const data = parsed.data;
  const stage = await prisma.pipelineStage.findFirst({ where: { id: data.stageId, pipelineId: data.pipelineId, pipeline: { tenantId: session.tenantId } } });
  if (!stage) return NextResponse.json({ error: 'Etapa inválida para este tenant.' }, { status: 400 });
  if (data.eventName === 'CustomEvent' && !data.customEventName) return NextResponse.json({ error: 'Informe o nome personalizado do evento.' }, { status: 400 });
  const duplicate = await prisma.kanbanStageTrackingEvent.findFirst({
    where: { id: { not: existing.id }, tenantId: session.tenantId, stageId: data.stageId, provider: data.provider, eventName: data.eventName, customEventName: data.eventName === 'CustomEvent' ? data.customEventName || null : null },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: 'Já existe um evento igual para este provedor e etapa.' }, { status: 409 });
  const event = await prisma.kanbanStageTrackingEvent.update({
    where: { id: existing.id },
    data: {
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      provider: data.provider,
      eventName: data.eventName,
      customEventName: data.eventName === 'CustomEvent' ? data.customEventName || null : null,
      conversionLabel: data.conversionLabel || null,
      conversionValue: toPrismaDecimal(data.conversionValue),
      currency: data.currency || 'BRL',
      enabled: data.enabled,
    },
  });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: event.id, action: 'integrations.event_mapping_updated' });
  return NextResponse.json({ ok: true, event: serializeEvent(event) });
});

export const DELETE = withPermission('INTEGRATIONS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `integrations-events-delete:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const existing = await prisma.kanbanStageTrackingEvent.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
  await prisma.kanbanStageTrackingEvent.delete({ where: { id: existing.id } });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: existing.id, action: 'integrations.event_mapping_deleted' });
  return NextResponse.json({ ok: true });
});
