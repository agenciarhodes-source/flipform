import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { sendMetaCapiEvent } from '@/lib/tracking/meta-capi';
import { logTrackingEvent, toPrismaDecimal } from '@/lib/tracking';

export const whatsappMatchTypes = ['exact', 'contains', 'starts_with'] as const;
export type WhatsAppMatchType = (typeof whatsappMatchTypes)[number];

export type WhatsAppMessageEvent = {
  tenantId: string;
  conversationId?: string | null;
  messageId?: string | null;
  leadId?: string | null;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  text: string;
  direction: 'inbound' | 'outbound';
  senderType: 'customer' | 'agent' | 'system';
  timestamp?: string | null;
  metadata?: unknown;
};

export function normalizeSellerPhrase(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR');
}

export function doesWhatsAppTriggerMatch(message: string, phrase: string, matchType: WhatsAppMatchType) {
  const normalizedMessage = normalizeSellerPhrase(message);
  const normalizedPhrase = normalizeSellerPhrase(phrase);
  if (!normalizedMessage || !normalizedPhrase) return false;
  if (matchType === 'exact') return normalizedMessage === normalizedPhrase;
  if (matchType === 'contains') return normalizedMessage.includes(normalizedPhrase);
  return normalizedMessage.startsWith(normalizedPhrase);
}

export function serializeWhatsAppTrigger(trigger: any) {
  return {
    ...trigger,
    conversionValue: trigger.conversionValue === null || trigger.conversionValue === undefined ? null : Number(trigger.conversionValue),
  };
}

export async function validateWhatsAppTriggerStage(tenantId: string, pipelineId?: string | null, stageId?: string | null) {
  if (!pipelineId && !stageId) return true;
  if (!pipelineId || !stageId) return false;
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId, pipeline: { tenantId } }, select: { id: true } });
  return Boolean(stage);
}

export async function hasWhatsAppDuplicate(params: { tenantId: string; leadId?: string | null; conversationId?: string | null; messageId?: string | null; triggerRuleId: string; eventName: string }) {
  const identity = params.leadId ? { leadId: params.leadId } : params.conversationId ? { conversationId: params.conversationId } : params.messageId ? { messageId: params.messageId } : null;
  if (!identity) return false;
  const existing = await prisma.trackingEventLog.findFirst({
    where: { tenantId: params.tenantId, triggerRuleId: params.triggerRuleId, eventName: params.eventName, status: { in: ['pending', 'sent'] }, ...identity },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function processWhatsAppFunnelMessage(event: WhatsAppMessageEvent) {
  if (event.direction !== 'outbound' && event.senderType !== 'agent') return { status: 'skipped', reason: 'inbound_or_not_agent' };
  if (event.senderType === 'system') return { status: 'skipped', reason: 'system_message' };

  const settings = await prisma.tenantIntegrationSettings.findUnique({ where: { tenantId: event.tenantId } });
  if (!settings?.whatsappFunnelEnabled) return { status: 'skipped', reason: 'whatsapp_funnel_disabled' };

  const triggers = await prisma.whatsAppEventTrigger.findMany({ where: { tenantId: event.tenantId, enabled: true }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
  const matched = triggers.find((trigger: any) => doesWhatsAppTriggerMatch(event.text, trigger.triggerPhrase, trigger.matchType));
  if (!matched) return { status: 'skipped', reason: 'no_matching_trigger' };

  const eventName = matched.eventName === 'CustomEvent' ? matched.customEventName : matched.eventName;
  if (!eventName) return { status: 'skipped', reason: 'missing_event_name' };

  const eventId = randomUUID();
  const base = {
    tenantId: event.tenantId,
    leadId: event.leadId || null,
    pipelineId: matched.pipelineId || null,
    toStageId: matched.stageId || null,
    provider: 'meta',
    eventName,
    eventId,
    conversationId: event.conversationId || null,
    messageId: event.messageId || null,
    triggerRuleId: matched.id,
    messageDirection: event.direction,
    source: 'whatsapp_funnel',
  };

  if (matched.oncePerLead && await hasWhatsAppDuplicate({ tenantId: event.tenantId, leadId: event.leadId, conversationId: event.conversationId, messageId: event.messageId, triggerRuleId: matched.id, eventName })) {
    await logTrackingEvent({ ...base, status: 'skipped', reason: 'duplicate' });
    return { status: 'skipped', reason: 'duplicate', triggerId: matched.id, eventId };
  }

  await logTrackingEvent({ ...base, status: 'pending' });
  try {
    if (!settings.metaPixelEnabled || !settings.metaPixelId || !settings.metaAccessTokenEncrypted) {
      await logTrackingEvent({ ...base, status: 'skipped', reason: 'Meta desativado ou sem Pixel/Token configurado' });
      return { status: 'skipped', reason: 'meta_not_configured', triggerId: matched.id, eventId };
    }
    const accessToken = decryptIntegrationSecret(settings.metaAccessTokenEncrypted);
    if (!accessToken) throw new Error('Token Meta indisponível para descriptografia');
    const result = await sendMetaCapiEvent({
      pixelId: settings.metaPixelId,
      accessToken,
      eventName,
      eventId,
      actionSource: 'system_generated',
      testEventCode: settings.metaTestEventCode,
      user: { email: event.email, phone: event.phone },
      customData: {
        currency: matched.currency || 'BRL',
        value: matched.conversionValue ? Number(matched.conversionValue) : undefined,
        source: 'whatsapp_funnel',
        trigger_type: 'seller_phrase',
        lead_id: event.leadId || undefined,
        conversation_id: event.conversationId || undefined,
        rule_id: matched.id,
        stage_id: matched.stageId || undefined,
      },
    });
    if (!result.ok) throw new Error(result.reason || 'Falha ao enviar evento Meta');
    await prisma.whatsAppEventTrigger.update({ where: { id: matched.id }, data: { lastTriggeredAt: new Date() } });
    await logTrackingEvent({ ...base, status: 'sent' });
    return { status: 'sent', triggerId: matched.id, eventName, eventId };
  } catch (error: any) {
    await logTrackingEvent({ ...base, status: 'failed', reason: error?.message || 'Falha ao disparar evento' });
    return { status: 'failed', reason: error?.message || 'Falha ao disparar evento', triggerId: matched.id, eventId };
  }
}

export function toWhatsAppTriggerData(data: any, tenantId: string) {
  return {
    tenantId,
    name: data.name,
    orderIndex: data.orderIndex ?? 0,
    triggerPhrase: data.triggerPhrase,
    matchType: data.matchType || 'exact',
    provider: 'meta',
    eventName: data.eventName,
    customEventName: data.eventName === 'CustomEvent' ? data.customEventName || null : null,
    conversionValue: toPrismaDecimal(data.conversionValue),
    currency: data.currency || 'BRL',
    pipelineId: data.pipelineId || null,
    stageId: data.stageId || null,
    oncePerLead: data.oncePerLead ?? true,
    requireExactMatch: (data.matchType || 'exact') === 'exact',
    enabled: data.enabled ?? true,
  } satisfies Prisma.WhatsAppEventTriggerUncheckedCreateInput;
}
