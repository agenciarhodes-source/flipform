import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { serializeWhatsAppTrigger, toWhatsAppTriggerData, validateWhatsAppTriggerStage } from '@/lib/tracking/whatsapp-funnel';
import { whatsappTriggerSchema } from '@/lib/tracking/whatsapp-trigger-schema';
export const PUT = withPermission('INTEGRATIONS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `whatsapp-funnel-put:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 }); if (!rl.allowed) return rateLimitResponse(rl);
  const existing = await prisma.whatsAppEventTrigger.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } }); if (!existing) return NextResponse.json({ error: 'Frase-gatilho não encontrada.' }, { status: 404 });
  const parsed = whatsappTriggerSchema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });
  const data = parsed.data; if (data.eventName === 'CustomEvent' && !data.customEventName) return NextResponse.json({ error: 'Informe o nome personalizado do evento.' }, { status: 400 });
  if (!(await validateWhatsAppTriggerStage(session.tenantId, data.pipelineId, data.stageId))) return NextResponse.json({ error: 'Pipeline/etapa inválidos para este tenant.' }, { status: 400 });
  const duplicate = await prisma.whatsAppEventTrigger.findFirst({ where: { id: { not: existing.id }, tenantId: session.tenantId, triggerPhrase: data.triggerPhrase, matchType: data.matchType }, select: { id: true } }); if (duplicate) return NextResponse.json({ error: 'Já existe uma frase igual com este tipo de correspondência.' }, { status: 409 });
  const trigger = await prisma.whatsAppEventTrigger.update({ where: { id: existing.id }, data: toWhatsAppTriggerData(data, session.tenantId) });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'whatsapp_funnel_trigger', entityId: trigger.id, action: trigger.enabled ? 'whatsapp_funnel_trigger.updated' : 'whatsapp_funnel_trigger.disabled' });
  return NextResponse.json({ ok: true, trigger: serializeWhatsAppTrigger(trigger) });
});
export const DELETE = withPermission('INTEGRATIONS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `whatsapp-funnel-delete:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 }); if (!rl.allowed) return rateLimitResponse(rl);
  const existing = await prisma.whatsAppEventTrigger.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } }); if (!existing) return NextResponse.json({ error: 'Frase-gatilho não encontrada.' }, { status: 404 });
  await prisma.whatsAppEventTrigger.delete({ where: { id: existing.id } }); await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'whatsapp_funnel_trigger', entityId: existing.id, action: 'whatsapp_funnel_trigger.deleted' }); return NextResponse.json({ ok: true });
});
