import { z } from 'zod';
import { prisma } from './prisma';

export const integrationsSchema = z.object({
  metaPixelEnabled: z.boolean().default(false),
  metaPixelId: z.string().trim().regex(/^[0-9]{5,30}$/).optional().or(z.literal('')),
  gtmEnabled: z.boolean().default(false),
  gtmContainerId: z.string().trim().regex(/^GTM-[A-Z0-9]+$/).optional().or(z.literal('')),
  ga4Enabled: z.boolean().default(false),
  ga4MeasurementId: z.string().trim().regex(/^G-[A-Z0-9]+$/).optional().or(z.literal('')),
  googleAdsEnabled: z.boolean().default(false),
  googleAdsId: z.string().trim().regex(/^AW-[0-9]+$/).optional().or(z.literal('')),
  googleAdsLabel: z.string().trim().max(120).optional().or(z.literal('')),
});

export const kanbanEventSchema = z.object({
  stageId: z.string().min(1),
  provider: z.enum(['meta', 'gtm', 'ga4', 'google_ads']),
  eventName: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
});

export async function getTrackingConfig(tenantId: string) {
  return prisma.tenantIntegrationSettings.findUnique({ where: { tenantId } });
}

export async function logTrackingEvent(data: {
  tenantId: string; leadId?: string | null; pipelineId?: string | null; fromStageId?: string | null; toStageId?: string | null;
  provider: string; eventName: string; status: string; reason?: string | null; triggeredById?: string | null; eventId?: string | null;
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
      status: { in: ['queued', 'sent'] },
    },
    select: { id: true },
  });
  return Boolean(exists);
}
