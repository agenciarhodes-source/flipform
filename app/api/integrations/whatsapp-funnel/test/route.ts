import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { doesWhatsAppTriggerMatch, processWhatsAppFunnelMessage } from '@/lib/tracking/whatsapp-funnel';
import { logPlatformAudit } from '@/lib/platform-audit';
const schema = z.object({ text: z.string().trim().min(1), triggerId: z.string().optional(), dryRun: z.boolean().default(true) });
export const POST = withPermission('INTEGRATIONS_EDIT', async (req, session) => {
  const parsed = schema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 });
  const triggers = await prisma.whatsAppEventTrigger.findMany({ where: { tenantId: session.tenantId, enabled: true, ...(parsed.data.triggerId ? { id: parsed.data.triggerId } : {}) }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
  const matched = triggers.find((trigger: any) => doesWhatsAppTriggerMatch(parsed.data.text, trigger.triggerPhrase, trigger.matchType));
  await logPlatformAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'whatsapp_funnel', entityId: matched?.id || session.tenantId, action: 'whatsapp_funnel_trigger.tested' });
  if (parsed.data.dryRun !== false) return NextResponse.json({ ok: true, matched: matched ? { id: matched.id, name: matched.name, eventName: matched.customEventName || matched.eventName } : null });
  const result = await processWhatsAppFunnelMessage({ tenantId: session.tenantId, text: parsed.data.text, direction: 'outbound', senderType: 'agent' }); return NextResponse.json({ ok: true, result });
});
