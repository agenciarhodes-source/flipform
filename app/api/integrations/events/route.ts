import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { kanbanEventSchema, toPrismaDecimal } from '@/lib/tracking';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';

function serializeEvent(event: any) {
  return { ...event, conversionValue: event.conversionValue === null || event.conversionValue === undefined ? null : Number(event.conversionValue) };
}

async function validateStage(tenantId: string, pipelineId: string, stageId: string) {
  return prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId, pipeline: { tenantId } }, include: { pipeline: { select: { id: true, name: true } } } });
}

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [events, pipelines] = await Promise.all([
    prisma.kanbanStageTrackingEvent.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.pipeline.findMany({ where: { tenantId: session.tenantId, isArchived: false }, include: { stages: { where: { isArchived: false }, orderBy: { orderIndex: 'asc' } } }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
  ]);
  return NextResponse.json({ events: events.map(serializeEvent), pipelines });
});

export const POST = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const rl = rateLimit({ key: `integrations-events-post:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = kanbanEventSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });
  const data = parsed.data;
  const stage = await validateStage(session.tenantId, data.pipelineId, data.stageId);
  if (!stage) return NextResponse.json({ error: 'Etapa inválida para este tenant.' }, { status: 400 });
  const eventName = data.eventName === 'CustomEvent' ? data.customEventName : data.eventName;
  if (!eventName) return NextResponse.json({ error: 'Informe o nome personalizado do evento.' }, { status: 400 });

  const duplicate = await prisma.kanbanStageTrackingEvent.findFirst({
    where: { tenantId: session.tenantId, stageId: data.stageId, provider: data.provider, OR: [{ eventName: data.eventName, customEventName: data.customEventName || null }, { eventName }] },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: 'Já existe um evento igual para este provedor e etapa.' }, { status: 409 });

  const event = await prisma.kanbanStageTrackingEvent.create({
    data: {
      tenantId: session.tenantId,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      provider: data.provider,
      eventName: data.eventName,
      customEventName: data.eventName === 'CustomEvent' ? data.customEventName || null : null,
      conversionLabel: data.conversionLabel || null,
      conversionValue: toPrismaDecimal(data.conversionValue),
      currency: data.currency || 'BRL',
      enabled: data.enabled,
      metadata: Prisma.JsonNull,
    },
  });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'integration', entityId: event.id, action: 'integrations.event_mapping_created' });
  return NextResponse.json({ ok: true, event: serializeEvent(event) });
});
