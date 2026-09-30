import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FlipAiError } from './access';
import { recordFlipAiCreditEntry } from './credits';
import {
  estimateOpenAiUsageCost,
  OPENAI_PRICE_SNAPSHOT,
  type OpenAiCostCoverage,
} from './openai-pricing';

export const FLIP_AI_NANO_USD_PER_CREDIT = 1_000;

export type FlipAiUsageBillingStatus =
  | 'charged'
  | 'not_billable'
  | 'insufficient_balance'
  | 'billing_unavailable'
  | 'refunded'
  | 'failed';

export type FlipAiUsageBillingResult = {
  status: FlipAiUsageBillingStatus;
  eventId: string;
  amountCredits: number;
  costNanoUsd: number;
  ledgerEntryId: string | null;
  reused: boolean;
  reason: string | null;
};

type UsageEventForBilling = {
  id: string;
  tenantId: string;
  operation: string;
  provider: string;
  model: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

function safeWhole(value: number | null | undefined) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function nanoUsdToFlipAiCredits(costNanoUsd: number) {
  if (!Number.isSafeInteger(costNanoUsd) || costNanoUsd <= 0) return 0;
  const credits = Math.ceil(costNanoUsd / FLIP_AI_NANO_USD_PER_CREDIT);
  return Number.isSafeInteger(credits) && credits > 0 ? credits : 0;
}

async function writeBillingMetadata(input: {
  tenantId: string;
  eventId: string;
  status: FlipAiUsageBillingStatus;
  amountCredits: number;
  costNanoUsd: number;
  ledgerEntryId?: string | null;
  reason?: string | null;
}) {
  const billing = {
    status: input.status,
    amountCredits: input.amountCredits,
    costNanoUsd: input.costNanoUsd,
    ledgerEntryId: input.ledgerEntryId || null,
    reason: input.reason || null,
    priceSnapshot: OPENAI_PRICE_SNAPSHOT,
    nanoUsdPerCredit: FLIP_AI_NANO_USD_PER_CREDIT,
    settledAt: new Date().toISOString(),
  };
  await prisma.$executeRaw(Prisma.sql`
    UPDATE flip_ai_usage_events
    SET metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('billing', ${JSON.stringify(billing)}::jsonb)
    WHERE id = ${input.eventId} AND tenant_id = ${input.tenantId}
  `);
}

function unpricedReason(coverage: OpenAiCostCoverage, reason: string | null) {
  if (reason) return reason;
  return coverage === 'partial' ? 'partial_cost' : 'no_confirmed_cost';
}

export async function settleFlipAiUsageCharge(input: {
  tenantId: string;
  eventId: string;
}): Promise<FlipAiUsageBillingResult> {
  const fallback: FlipAiUsageBillingResult = {
    status: 'failed',
    eventId: input.eventId,
    amountCredits: 0,
    costNanoUsd: 0,
    ledgerEntryId: null,
    reused: false,
    reason: 'billing_error',
  };

  try {
    const event = await prisma.flipAiUsageEvent.findFirst({
      where: { id: input.eventId, tenantId: input.tenantId },
      select: {
        id: true,
        tenantId: true,
        operation: true,
        provider: true,
        model: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
      },
    }) as UsageEventForBilling | null;
    if (!event || event.status !== 'confirmed' || event.provider !== 'openai') {
      return {
        ...fallback,
        status: 'not_billable',
        reason: event ? 'usage_not_confirmed' : 'usage_not_found',
      };
    }

    const existingRefund = await prisma.flipAiCreditLedgerEntry.findFirst({
      where: {
        tenantId: event.tenantId,
        idempotencyKey: `usage-refund:${event.id}`,
        entryType: 'refund',
        referenceId: event.id,
      },
      select: { id: true, amountCredits: true },
    });
    if (existingRefund) {
      return {
        status: 'refunded',
        eventId: event.id,
        amountCredits: existingRefund.amountCredits,
        costNanoUsd: existingRefund.amountCredits * FLIP_AI_NANO_USD_PER_CREDIT,
        ledgerEntryId: existingRefund.id,
        reused: true,
        reason: 'already_refunded',
      };
    }

    const estimate = estimateOpenAiUsageCost({
      operation: event.operation,
      model: event.model,
      confirmedEvents: 1,
      inputTokens: safeWhole(event.inputTokens),
      outputTokens: safeWhole(event.outputTokens),
    });
    const amountCredits = nanoUsdToFlipAiCredits(estimate.costNanoUsd);

    if (estimate.coverage !== 'full' || amountCredits === 0) {
      const reason = unpricedReason(estimate.coverage, estimate.reason);
      await writeBillingMetadata({
        tenantId: event.tenantId,
        eventId: event.id,
        status: 'not_billable',
        amountCredits: 0,
        costNanoUsd: estimate.costNanoUsd,
        reason,
      }).catch(() => undefined);
      return {
        status: 'not_billable',
        eventId: event.id,
        amountCredits: 0,
        costNanoUsd: estimate.costNanoUsd,
        ledgerEntryId: null,
        reused: false,
        reason,
      };
    }

    try {
      const debit = await recordFlipAiCreditEntry({
        tenantId: event.tenantId,
        idempotencyKey: `usage:${event.id}`,
        entryType: 'debit',
        amountCredits,
        source: 'usage',
        referenceId: event.id,
      });
      await writeBillingMetadata({
        tenantId: event.tenantId,
        eventId: event.id,
        status: 'charged',
        amountCredits,
        costNanoUsd: estimate.costNanoUsd,
        ledgerEntryId: debit.entryId,
      }).catch(() => undefined);
      return {
        status: 'charged',
        eventId: event.id,
        amountCredits,
        costNanoUsd: estimate.costNanoUsd,
        ledgerEntryId: debit.entryId,
        reused: debit.reused,
        reason: null,
      };
    } catch (error) {
      const insufficient = error instanceof FlipAiError
        && error.code === 'FLIP_AI_CREDIT_BALANCE_INSUFFICIENT';
      const unavailable = error instanceof FlipAiError
        && ['FLIP_AI_CREDIT_SCHEMA_NOT_READY', 'FLIP_AI_CREDIT_ACCOUNT_UNAVAILABLE'].includes(error.code);
      const status: FlipAiUsageBillingStatus = insufficient
        ? 'insufficient_balance'
        : unavailable ? 'billing_unavailable' : 'failed';
      const reason = error instanceof FlipAiError ? error.code : 'billing_error';
      await writeBillingMetadata({
        tenantId: event.tenantId,
        eventId: event.id,
        status,
        amountCredits,
        costNanoUsd: estimate.costNanoUsd,
        reason,
      }).catch(() => undefined);
      return {
        status,
        eventId: event.id,
        amountCredits,
        costNanoUsd: estimate.costNanoUsd,
        ledgerEntryId: null,
        reused: false,
        reason,
      };
    }
  } catch {
    return fallback;
  }
}

export async function refundFlipAiUsageCharge(input: {
  tenantId: string;
  eventId: string;
  reason: string;
}) {
  const debit = await prisma.flipAiCreditLedgerEntry.findFirst({
    where: {
      tenantId: input.tenantId,
      idempotencyKey: `usage:${input.eventId}`,
      entryType: 'debit',
      referenceId: input.eventId,
    },
    select: { id: true, amountCredits: true },
  });
  if (!debit) {
    throw new FlipAiError('FLIP_AI_USAGE_CHARGE_NOT_FOUND', 404,
      'Nenhum débito confirmado foi encontrado para este consumo.');
  }

  const refund = await recordFlipAiCreditEntry({
    tenantId: input.tenantId,
    idempotencyKey: `usage-refund:${input.eventId}`,
    entryType: 'refund',
    amountCredits: debit.amountCredits,
    source: 'refund',
    referenceId: input.eventId,
  });
  await writeBillingMetadata({
    tenantId: input.tenantId,
    eventId: input.eventId,
    status: 'refunded',
    amountCredits: debit.amountCredits,
    costNanoUsd: debit.amountCredits * FLIP_AI_NANO_USD_PER_CREDIT,
    ledgerEntryId: refund.entryId,
    reason: `refunded:${input.reason.trim().slice(0, 120) || 'manual'}`,
  });
  return {
    entryId: refund.entryId,
    amountCredits: debit.amountCredits,
    balanceCredits: refund.balanceCredits,
    reused: refund.reused,
  };
}
