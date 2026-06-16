import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { whatsappTriggerSchema } from '@/lib/tracking/whatsapp-trigger-schema';
import { serializeWhatsAppTrigger, toWhatsAppTriggerData, validateWhatsAppTriggerStage } from '@/lib/tracking/whatsapp-funnel';
export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const triggers = await prisma.whatsAppEventTrigger.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
  return NextResponse.json({ triggers: triggers.map(serializeWhatsAppTrigger) });
});
export const POST = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const rl = rateLimit({ key: `whatsapp-funnel-post:${session.tenantId}:${getClientIp(req)}`, limit: 30, windowMs: 60_000 }); if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = whatsappTriggerSchema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });
  const data = parsed.data; if (data.eventName === 'CustomEvent' && !data.customEventName) return NextResponse.json({ error: 'Informe o nome personalizado do evento.' }, { status: 400 });
  if (!(await validateWhatsAppTriggerStage(session.tenantId, data.pipelineId, data.stageId))) return NextResponse.json({ error: 'Pipeline/etapa inválidos para este tenant.' }, { status: 400 });
  const duplicate = await prisma.whatsAppEventTrigger.findFirst({ where: { tenantId: session.tenantId, triggerPhrase: data.triggerPhrase, matchType: data.matchType }, select: { id: true } }); if (duplicate) return NextResponse.json({ error: 'Já existe uma frase igual com este tipo de correspondência.' }, { status: 409 });
  const trigger = await prisma.whatsAppEventTrigger.create({ data: toWhatsAppTriggerData(data, session.tenantId) });
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'whatsapp_funnel_trigger', entityId: trigger.id, action: 'whatsapp_funnel_trigger.created' });
  return NextResponse.json({ ok: true, trigger: serializeWhatsAppTrigger(trigger) });
});
