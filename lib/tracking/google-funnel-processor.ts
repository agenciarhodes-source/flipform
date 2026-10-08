import 'server-only';
import { prisma } from '@/lib/prisma';
import { GOOGLE_CONVERSION_MAX_ATTEMPTS, planGoogleConversionRetry } from './google-funnel';
import {
  buildGoogleConversionIngestRequest,
  getGoogleDataManagerAccessToken,
  resolveGoogleFunnelTransportConfig,
  sendGoogleConversionIngest,
  type GoogleConversionSendOutcome,
  type GoogleFunnelTransportConfig,
} from './google-data-manager';

/**
 * Drains the Google conversion outbox. It only updates rows of
 * google_conversion_events: leads, stages and attribution are read, never
 * written, and the Meta funnel is not involved.
 */

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_TIME_BUDGET_MS = 40_000;
/** While an event is being delivered no other run may pick it up. */
const CLAIM_LEASE_MS = 10 * 60_000;
/** A dry run validates the payload and checks the same event again later. */
const DRY_RUN_RECHECK_MS = 60 * 60_000;
/** Google rejects conversions older than the click conversion window. */
const MAX_EVENT_AGE_MS = 80 * 24 * 60 * 60_000;

export type GoogleOutboxProcessOptions = {
  config?: GoogleFunnelTransportConfig;
  now?: Date;
  limit?: number;
  timeBudgetMs?: number;
  getAccessToken?: () => Promise<string | null>;
  send?: (body: Record<string, unknown>, accessToken: string) => Promise<GoogleConversionSendOutcome>;
};

export type GoogleOutboxProcessSummary = {
  status: 'processed' | 'transport_disabled' | 'credentials_missing' | 'no_paired_tenant';
  claimed: number;
  sent: number;
  validated: number;
  rejected: number;
  retried: number;
  failed: number;
};

function emptySummary(status: GoogleOutboxProcessSummary['status']): GoogleOutboxProcessSummary {
  return { status, claimed: 0, sent: 0, validated: 0, rejected: 0, retried: 0, failed: 0 };
}

export async function processGoogleConversionOutbox(
  options: GoogleOutboxProcessOptions = {},
): Promise<GoogleOutboxProcessSummary> {
  const config = options.config || resolveGoogleFunnelTransportConfig();
  if (!config.enabled) return emptySummary('transport_disabled');
  const serviceAccount = config.serviceAccount;
  if (!serviceAccount) return emptySummary('credentials_missing');
  // Only tenants explicitly paired with a Google Ads account are ever read.
  const pairedTenantIds = Array.from(config.tenantAccounts.keys());
  if (pairedTenantIds.length === 0) return emptySummary('no_paired_tenant');

  const startedAtMs = Date.now();
  const now = options.now || new Date();
  const getAccessToken = options.getAccessToken || (() => getGoogleDataManagerAccessToken(serviceAccount));
  const send = options.send || ((body, accessToken) => sendGoogleConversionIngest(body, accessToken));
  const summary = emptySummary('processed');

  const due = await prisma.googleConversionEvent.findMany({
    where: {
      tenantId: { in: pairedTenantIds },
      state: { in: ['PENDING', 'RETRY'] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(options.limit ?? DEFAULT_BATCH_SIZE, 1), 50),
  });

  for (const event of due) {
    if (Date.now() - startedAtMs > (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS)) break;

    const attempts = event.attempts + 1;
    // Optimistic claim: a concurrent run that already took this event wins.
    const claim = await prisma.googleConversionEvent.updateMany({
      where: { id: event.id, tenantId: event.tenantId, state: event.state, attempts: event.attempts },
      data: { attempts, lastAttemptAt: now, nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    if (claim.count !== 1) continue;
    summary.claimed += 1;

    const finish = (data: {
      state: 'PENDING' | 'SENT' | 'REJECTED' | 'RETRY' | 'FAILED';
      lastErrorCode: string | null;
      nextAttemptAt?: Date | null;
      attempts?: number;
      finalizedAt?: Date | null;
    }) =>
      prisma.googleConversionEvent.updateMany({
        where: { id: event.id, tenantId: event.tenantId },
        data: { nextAttemptAt: null, ...data },
      });

    const fail = async (code: string) => {
      await finish({ state: 'FAILED', lastErrorCode: code });
      summary.failed += 1;
    };
    const retry = async (code: string) => {
      const plan = planGoogleConversionRetry(attempts);
      if (plan.state === 'FAILED') return fail(code);
      await finish({ state: 'RETRY', lastErrorCode: code, nextAttemptAt: new Date(now.getTime() + plan.delayMs) });
      summary.retried += 1;
    };

    try {
      if (event.attempts >= GOOGLE_CONVERSION_MAX_ATTEMPTS) {
        await fail('MAX_ATTEMPTS');
        continue;
      }
      if (now.getTime() - event.conversionTime.getTime() > MAX_EVENT_AGE_MS) {
        await fail('EXPIRED');
        continue;
      }
      const lead = await prisma.lead.findFirst({
        where: { id: event.leadId, tenantId: event.tenantId },
        select: { email: true, phone: true, attribution: { select: { gclid: true } } },
      });
      if (!lead) {
        await fail('LEAD_NOT_FOUND');
        continue;
      }

      const built = buildGoogleConversionIngestRequest(config, {
        tenantId: event.tenantId,
        conversionActionResource: event.conversionActionResource,
        idempotencyKey: event.idempotencyKey,
        conversionTime: event.conversionTime,
        conversionValue: event.conversionValue === null ? null : Number(event.conversionValue),
        currency: event.currency,
        clickIds: { gclid: lead.attribution?.gclid ?? null },
        lead: { email: lead.email, phone: lead.phone },
      });
      if (!built.ok) {
        await fail(built.code);
        continue;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        await retry('AUTH_UNAVAILABLE');
        continue;
      }

      const result = await send(built.body, accessToken);
      if (result.outcome === 'sent') {
        await finish({ state: 'SENT', lastErrorCode: null });
        summary.sent += 1;
      } else if (result.outcome === 'validated') {
        // Nothing was ingested: the event stays queued and the attempt is not consumed.
        await finish({
          state: 'PENDING',
          lastErrorCode: 'DRY_RUN_VALIDATED',
          attempts: event.attempts,
          nextAttemptAt: new Date(now.getTime() + DRY_RUN_RECHECK_MS),
        });
        summary.validated += 1;
      } else if (result.outcome === 'rejected') {
        await finish({ state: 'REJECTED', lastErrorCode: result.code, finalizedAt: now });
        summary.rejected += 1;
      } else {
        await retry(result.code);
      }
    } catch {
      // Keep the claim lease: the event is retried by a later run, never lost or duplicated.
      summary.retried += 1;
    }
  }

  return summary;
}
