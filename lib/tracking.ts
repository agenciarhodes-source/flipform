import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { decryptIntegrationSecret, encryptIntegrationSecret, looksMaskedSecret, maskSecretFromEncrypted } from './tracking/crypto';
import { sendMetaCapiEvent } from './tracking/meta-capi';

export const trackingProviders = ['meta', 'gtm', 'ga4', 'google_ads'] as const;
export const funnelEventNames = ['Lead', 'CompleteRegistration', 'Contact', 'QualifiedLead', 'InitiateCheckout', 'Purchase', 'CustomEvent'] as const;

const optionalString = (max = 255) => z.string().trim().max(max).optional().or(z.literal(''));

export const integrationsSchema = z.object({
  metaPixelEnabled: z.boolean().default(false),
  metaPixelId: z.string().trim().regex(/^[0-9]{5,30}$/, 'Meta Pixel ID inválido. Use apenas números.').optional().or(z.literal('')),
  metaAccessToken: z.string().trim().max(4096).optional().or(z.literal('')),
  metaTestEventCode: optionalString(120),
  gtmEnabled: z.boolean().default(false),
  gtmContainerId: z.string().trim().regex(/^GTM-[A-Z0-9]+$/, 'GTM Container ID inválido. Exemplo: GTM-XXXXXXX.').optional().or(z.literal('')),
  ga4Enabled: z.boolean().default(false),
  ga4MeasurementId: z.string().trim().regex(/^G-[A-Z0-9]+$/, 'GA4 Measurement ID inválido. Exemplo: G-XXXXXXXXXX.').optional().or(z.literal('')),
  ga4ApiSecret: z.string().trim().max(512).optional().or(z.literal('')),
  googleAdsEnabled: z.boolean().default(false),
  googleAdsId: z.string().trim().regex(/^AW-[0-9]+$/, 'Google Ads Conversion ID inválido. Exemplo: AW-123456789.').optional().or(z.literal('')),
  googleAdsLabel: optionalString(120),
  whatsappFunnelEnabled: z.boolean().default(false),
});

export const kanbanEventSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  provider: z.enum(trackingProviders),
  eventName: z.enum(funnelEventNames),
  customEventName: z.string().trim().min(1).max(64).optional().or(z.literal('')),
  conversionLabel: optionalString(120),
  conversionValue: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).default('BRL'),
  enabled: z.boolean().default(true),
});

export type TrackingDispatchContext = {
  tenantId: string;
  leadId?: string | null;
  pipelineId?: string | null;
  fromStageId?: string | null;
  toStageId?: string | null;
  triggeredById?: string | null;
  source: 'public_form' | 'kanban' | 'test';
  lead?: { email?: string | null; phone?: string | null; name?: string | null } | null;
};

export function serializeIntegrationSettings(settings: any) {
  if (!settings) return null;
  const { metaAccessTokenEncrypted, ga4ApiSecretEncrypted, ...safe } = settings;
  return {
    ...safe,
    metaAccessTokenMasked: maskSecretFromEncrypted(metaAccessTokenEncrypted),
    ga4ApiSecretMasked: maskSecretFromEncrypted(ga4ApiSecretEncrypted),
  };
}

export function buildIntegrationSettingsData(input: z.infer<typeof integrationsSchema>, existing?: any) {
  const data: Record<string, unknown> = {
    metaPixelEnabled: input.metaPixelEnabled,
    metaPixelId: input.metaPixelId || null,
    metaTestEventCode: input.metaTestEventCode || null,
    gtmEnabled: input.gtmEnabled,
    gtmContainerId: input.gtmContainerId || null,
    ga4Enabled: input.ga4Enabled,
    ga4MeasurementId: input.ga4MeasurementId || null,
    googleAdsEnabled: input.googleAdsEnabled,
    googleAdsId: input.googleAdsId || null,
    googleAdsLabel: input.googleAdsLabel || null,
    whatsappFunnelEnabled: input.whatsappFunnelEnabled,
  };

  if (input.metaAccessToken !== undefined && !looksMaskedSecret(input.metaAccessToken)) {
    data.metaAccessTokenEncrypted = input.metaAccessToken ? encryptIntegrationSecret(input.metaAccessToken) : null;
  } else if (!existing?.metaAccessTokenEncrypted) {
    data.metaAccessTokenEncrypted = null;
  }

  if (input.ga4ApiSecret !== undefined && !looksMaskedSecret(input.ga4ApiSecret)) {
    data.ga4ApiSecretEncrypted = input.ga4ApiSecret ? encryptIntegrationSecret(input.ga4ApiSecret) : null;
  } else if (!existing?.ga4ApiSecretEncrypted) {
    data.ga4ApiSecretEncrypted = null;
  }

  return data;
}

export async function getTrackingConfig(tenantId: string) {
  return prisma.tenantIntegrationSettings.findUnique({ where: { tenantId } });
}

export async function logTrackingEvent(data: {
  tenantId: string; leadId?: string | null; pipelineId?: string | null; fromStageId?: string | null; toStageId?: string | null;
  provider: string; eventName: string; status: string; reason?: string | null; triggeredById?: string | null; eventId?: string | null;
  conversationId?: string | null; messageId?: string | null; triggerRuleId?: string | null; messageDirection?: string | null; source?: string | null;
}) {
  return prisma.trackingEventLog.create({ data });
}

export async function shouldSkipDuplicate(params: { tenantId: string; leadId?: string | null; toStageId?: string | null; provider: string; eventName: string }) {
  if (!params.leadId || !params.toStageId) return false;
  const exists = await prisma.trackingEventLog.findFirst({
    where: {
      tenantId: params.tenantId,
      leadId: params.leadId,
      toStageId: params.toStageId,
      provider: params.provider,
      eventName: params.eventName,
      status: { in: ['pending', 'sent'] },
    },
    select: { id: true },
  });
  return Boolean(exists);
}

function decimalToNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') return (value as any).toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildCustomData(mapping: any, source: TrackingDispatchContext['source']) {
  const value = decimalToNumber(mapping.conversionValue);
  const data: Record<string, unknown> = {
    content_name: mapping.customEventName || mapping.eventName,
    content_category: source === 'public_form' ? 'form_submission' : 'kanban',
    currency: mapping.currency || 'BRL',
  };
  if (value !== undefined) data.value = value;
  if (mapping.conversionLabel) data.conversion_label = mapping.conversionLabel;
  return data;
}

async function dispatchMapping(mapping: any, settings: any, context: TrackingDispatchContext) {
  const eventName = mapping.customEventName || mapping.eventName;
  const eventId = crypto.randomUUID();
  const base = {
    tenantId: context.tenantId,
    leadId: context.leadId || null,
    pipelineId: context.pipelineId || mapping.pipelineId || null,
    fromStageId: context.fromStageId || null,
    toStageId: context.toStageId || mapping.stageId || null,
    provider: mapping.provider,
    eventName,
    triggeredById: context.triggeredById || null,
    eventId,
  };

  const skip = await shouldSkipDuplicate({ tenantId: context.tenantId, leadId: context.leadId, toStageId: context.toStageId || mapping.stageId, provider: mapping.provider, eventName });
  if (skip) {
    await logTrackingEvent({ ...base, status: 'skipped', reason: 'duplicate' });
    return { provider: mapping.provider, eventName, status: 'skipped', eventId };
  }

  await logTrackingEvent({ ...base, status: 'pending' });

  try {
    if (mapping.provider === 'meta') {
      if (!settings?.metaPixelEnabled || !settings.metaPixelId || !settings.metaAccessTokenEncrypted) {
        await logTrackingEvent({ ...base, status: 'skipped', reason: 'Meta desativado ou sem Pixel/Token configurado' });
        return { provider: mapping.provider, eventName, status: 'skipped', eventId };
      }
      const token = decryptIntegrationSecret(settings.metaAccessTokenEncrypted);
      if (!token) throw new Error('Token Meta indisponível para descriptografia');
      const result = await sendMetaCapiEvent({
        pixelId: settings.metaPixelId,
        accessToken: token,
        eventName,
        eventId,
        actionSource: context.source === 'public_form' ? 'website' : 'system_generated',
        testEventCode: settings.metaTestEventCode,
        user: { email: context.lead?.email, phone: context.lead?.phone },
        customData: buildCustomData(mapping, context.source),
      });
      if (!result.ok) throw new Error(result.reason || 'Falha ao enviar evento Meta');
      await logTrackingEvent({ ...base, status: 'sent' });
      return { provider: mapping.provider, eventName, status: 'sent', eventId };
    }

    if (mapping.provider === 'google_ads') {
      if (!settings?.googleAdsEnabled || !settings.googleAdsId || !(mapping.conversionLabel || settings.googleAdsLabel)) {
        await logTrackingEvent({ ...base, status: 'skipped', reason: 'Google Ads desativado ou sem Conversion ID/Label configurado' });
        return { provider: mapping.provider, eventName, status: 'skipped', eventId };
      }
      await logTrackingEvent({ ...base, status: 'sent', reason: 'Evento Google Ads preparado para Measurement Protocol/API em PR incremental' });
      return { provider: mapping.provider, eventName, status: 'sent', eventId };
    }

    if (mapping.provider === 'gtm') {
      if (!settings?.gtmEnabled || !settings.gtmContainerId) {
        await logTrackingEvent({ ...base, status: 'skipped', reason: 'GTM desativado ou sem Container ID configurado' });
        return { provider: mapping.provider, eventName, status: 'skipped', eventId };
      }
      await logTrackingEvent({ ...base, status: 'sent', reason: 'Evento GTM preparado para camada client-side em PR incremental' });
      return { provider: mapping.provider, eventName, status: 'sent', eventId };
    }

    if (mapping.provider === 'ga4') {
      if (!settings?.ga4Enabled || !settings.ga4MeasurementId || !settings.ga4ApiSecretEncrypted) {
        await logTrackingEvent({ ...base, status: 'skipped', reason: 'GA4 desativado ou sem Measurement ID/API Secret configurado' });
        return { provider: mapping.provider, eventName, status: 'skipped', eventId };
      }
      await logTrackingEvent({ ...base, status: 'sent', reason: 'Evento GA4 preparado para Measurement Protocol em PR incremental' });
      return { provider: mapping.provider, eventName, status: 'sent', eventId };
    }

    await logTrackingEvent({ ...base, status: 'skipped', reason: 'Provider não suportado' });
    return { provider: mapping.provider, eventName, status: 'skipped', eventId };
  } catch (error: any) {
    await logTrackingEvent({ ...base, status: 'failed', reason: error?.message || 'Falha ao disparar evento' });
    return { provider: mapping.provider, eventName, status: 'failed', eventId };
  }
}

export async function dispatchKanbanStageTracking(context: TrackingDispatchContext) {
  if (!context.toStageId) return [];
  const settings = await getTrackingConfig(context.tenantId);
  const mappings = await prisma.kanbanStageTrackingEvent.findMany({
    where: { tenantId: context.tenantId, stageId: context.toStageId, enabled: true },
  });
  const results = [];
  for (const mapping of mappings) results.push(await dispatchMapping(mapping, settings, context));
  return results;
}

export async function dispatchFormSubmissionTracking(context: TrackingDispatchContext) {
  if (!context.toStageId) return [];
  const settings = await getTrackingConfig(context.tenantId);
  const mappings = await prisma.kanbanStageTrackingEvent.findMany({
    where: { tenantId: context.tenantId, stageId: context.toStageId, enabled: true },
  });

  const syntheticMappings: any[] = [];
  if (settings?.metaPixelEnabled) {
    syntheticMappings.push({ provider: 'meta', eventName: 'Lead', customEventName: null, pipelineId: context.pipelineId, stageId: context.toStageId, currency: 'BRL' });
  }
  if (settings?.googleAdsEnabled) {
    syntheticMappings.push({ provider: 'google_ads', eventName: 'Lead', customEventName: null, conversionLabel: settings.googleAdsLabel, pipelineId: context.pipelineId, stageId: context.toStageId, currency: 'BRL' });
  }

  const all = [...syntheticMappings, ...mappings];
  const deduped = all.filter((mapping, index) => {
    const key = `${mapping.provider}:${mapping.stageId}:${mapping.customEventName || mapping.eventName}`;
    return all.findIndex((item) => `${item.provider}:${item.stageId}:${item.customEventName || item.eventName}` === key) === index;
  });
  const results = [];
  for (const mapping of deduped) results.push(await dispatchMapping(mapping, settings, context));
  return results;
}

export function toPrismaDecimal(value?: number | null) {
  if (value === undefined || value === null) return null;
  return new Prisma.Decimal(value);
}
