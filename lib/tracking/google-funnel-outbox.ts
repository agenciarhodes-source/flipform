import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  buildGoogleConversionIdempotencyKey,
  resolveGoogleConversionValue,
  type GoogleConversionValueMode,
} from './google-funnel';

/**
 * Queues Google conversion events for a stage transition already committed by
 * the CRM. Nothing is sent here: events stay PENDING until a transport exists.
 */

export type GoogleConversionEnqueueInput = {
  tenantId: string;
  leadId: string;
  pipelineId: string;
  stageId: string;
  /** LeadStageHistory row of the transition that caused the event. */
  transitionId: string;
  occurredAt: Date;
  triggeredById?: string | null;
};

export type GoogleConversionEnqueueResult = {
  mappingId: string;
  status: 'queued' | 'duplicate' | 'already_signaled' | 'awaiting_purchase';
};

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toSafeLogCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  return error instanceof Error ? error.name : 'UNKNOWN';
}

async function enqueueForTransition(input: GoogleConversionEnqueueInput): Promise<GoogleConversionEnqueueResult[]> {
  const mappings = await prisma.googleConversionMapping.findMany({
    where: { tenantId: input.tenantId, stageId: input.stageId, enabled: true, archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (mappings.length === 0) return [];

  const needsPurchase = mappings.some((mapping) => mapping.valueMode === 'purchase');
  // Explicit LeadPurchase is the only source of revenue; a stage move never invents value.
  const purchase = needsPurchase
    ? await prisma.leadPurchase.findFirst({
        where: { tenantId: input.tenantId, leadId: input.leadId, amountCents: { gt: 0 } },
        orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
        select: { amountCents: true, currency: true },
      })
    : null;

  const results: GoogleConversionEnqueueResult[] = [];
  for (const mapping of mappings) {
    if (mapping.triggerRule !== 'every_entry') {
      const signaled = await prisma.googleConversionEvent.findFirst({
        where: { tenantId: input.tenantId, leadId: input.leadId, mappingId: mapping.id },
        select: { id: true },
      });
      if (signaled) {
        results.push({ mappingId: mapping.id, status: 'already_signaled' });
        continue;
      }
    }

    const value = resolveGoogleConversionValue(
      {
        valueMode: mapping.valueMode as GoogleConversionValueMode,
        conversionValue: mapping.conversionValue === null ? null : Number(mapping.conversionValue),
        currency: mapping.currency,
      },
      purchase,
    );
    if (value.status === 'awaiting_purchase') {
      results.push({ mappingId: mapping.id, status: 'awaiting_purchase' });
      continue;
    }

    try {
      await prisma.googleConversionEvent.create({
        data: {
          tenantId: input.tenantId,
          mappingId: mapping.id,
          leadId: input.leadId,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          transitionId: input.transitionId,
          conversionActionResource: mapping.conversionActionResource,
          conversionCategory: mapping.conversionCategory,
          idempotencyKey: buildGoogleConversionIdempotencyKey({
            tenantId: input.tenantId,
            leadId: input.leadId,
            stageId: input.stageId,
            conversionActionResource: mapping.conversionActionResource,
            transitionId: input.transitionId,
          }),
          state: 'PENDING',
          conversionTime: input.occurredAt,
          conversionValue: value.status === 'resolved' ? new Prisma.Decimal(value.value) : null,
          currency: value.status === 'resolved' ? value.currency : null,
          triggeredById: input.triggeredById || null,
        },
      });
      results.push({ mappingId: mapping.id, status: 'queued' });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      results.push({ mappingId: mapping.id, status: 'duplicate' });
    }
  }
  return results;
}

/**
 * Best-effort by contract: the lead move is already committed and must never
 * fail, roll back or wait on the Google funnel. Any error is logged without
 * lead data and swallowed.
 */
export async function enqueueGoogleConversionEvents(
  input: GoogleConversionEnqueueInput,
): Promise<GoogleConversionEnqueueResult[]> {
  try {
    return await enqueueForTransition(input);
  } catch (error) {
    const code = toSafeLogCode(error);
    // Tables not applied in this environment yet: the funnel is simply off.
    if (code !== 'P2021' && code !== 'P2022') console.error('google conversion enqueue skipped', { code });
    return [];
  }
}
