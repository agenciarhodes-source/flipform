import 'server-only';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Google Ads Funnel foundation: configuration contract, idempotency and event
 * lifecycle rules. This module performs no network or database access and
 * never dispatches a conversion; transport is added separately.
 */

export const GOOGLE_FUNNEL_PROVIDER = 'google_ads';

export const googleConversionCategories = ['lead', 'qualified_lead', 'converted_lead'] as const;
export type GoogleConversionCategory = (typeof googleConversionCategories)[number];

export const googleConversionOptimizationRoles = ['primary', 'secondary'] as const;
export type GoogleConversionOptimizationRole = (typeof googleConversionOptimizationRoles)[number];

/** `purchase` takes the value only from an explicit LeadPurchase, never from the stage move. */
export const googleConversionValueModes = ['none', 'fixed', 'purchase'] as const;
export type GoogleConversionValueMode = (typeof googleConversionValueModes)[number];

export const GOOGLE_CONVERSION_MAX_VALUE = 99_999_999.99;

const CONVERSION_ACTION_RESOURCE = /^customers\/([0-9]{1,12})\/conversionActions\/([0-9]{1,20})$/;

export function normalizeGoogleAdsCustomerId(value: string | null | undefined): string | null {
  const digits = (value || '').trim().replace(/-/g, '');
  return /^[0-9]{10}$/.test(digits) ? digits : null;
}

/** The conversion action must already exist in the customer's Google Ads account. */
export function parseGoogleConversionActionResource(value: string | null | undefined) {
  const match = CONVERSION_ACTION_RESOURCE.exec((value || '').trim());
  if (!match) return null;
  return { customerId: match[1], conversionActionId: match[2] };
}

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export const googleFunnelMappingSchema = z
  .object({
    pipelineId: z.string().trim().min(1).max(64),
    stageId: z.string().trim().min(1).max(64),
    conversionActionResource: z
      .string()
      .trim()
      .regex(CONVERSION_ACTION_RESOURCE, 'Ação de conversão inválida. Use customers/{id}/conversionActions/{id}.'),
    conversionCategory: z.enum(googleConversionCategories),
    optimizationRole: z.enum(googleConversionOptimizationRoles).default('secondary'),
    valueMode: z.enum(googleConversionValueModes).default('none'),
    conversionValue: z
      .number()
      .finite()
      .positive()
      .max(GOOGLE_CONVERSION_MAX_VALUE)
      .refine(hasAtMostTwoDecimals, 'Valor deve ter no máximo duas casas decimais.')
      .nullable()
      .optional(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'Moeda inválida. Use o código ISO de três letras.')
      .transform((value) => value.toUpperCase())
      .default('BRL'),
    // A mapping never starts sending signals by default; activation is explicit.
    enabled: z.boolean().default(false),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasValue = data.conversionValue !== null && data.conversionValue !== undefined;
    if (data.valueMode === 'fixed' && !hasValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conversionValue'], message: 'Informe o valor fixo da conversão.' });
    }
    if (data.valueMode !== 'fixed' && hasValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conversionValue'], message: 'Valor só é aceito quando o modo é valor fixo.' });
    }
  });

export type GoogleFunnelMappingInput = z.infer<typeof googleFunnelMappingSchema>;

export type GoogleConversionValueResolution =
  | { status: 'no_value' }
  | { status: 'awaiting_purchase' }
  | { status: 'resolved'; value: number; currency: string };

/** Server-owned value resolution; the browser never defines the final conversion value. */
export function resolveGoogleConversionValue(
  mapping: { valueMode: GoogleConversionValueMode; conversionValue?: number | null; currency?: string | null },
  purchase?: { amountCents: number; currency?: string | null } | null,
): GoogleConversionValueResolution {
  if (mapping.valueMode === 'fixed') {
    const value = mapping.conversionValue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return { status: 'no_value' };
    return { status: 'resolved', value, currency: mapping.currency || 'BRL' };
  }
  if (mapping.valueMode === 'purchase') {
    if (!purchase || !Number.isInteger(purchase.amountCents) || purchase.amountCents <= 0) {
      return { status: 'awaiting_purchase' };
    }
    return { status: 'resolved', value: purchase.amountCents / 100, currency: purchase.currency || mapping.currency || 'BRL' };
  }
  return { status: 'no_value' };
}

export type GoogleConversionIdempotencyInput = {
  tenantId: string;
  leadId: string;
  stageId: string;
  conversionActionResource: string;
  /** Identifier of the stage transition that caused the event (LeadStageHistory). */
  transitionId: string;
};

/** One conversion per tenant + lead + stage + conversion action + transition; retries reuse the key. */
export function buildGoogleConversionIdempotencyKey(input: GoogleConversionIdempotencyInput): string {
  const parts = [input.tenantId, input.leadId, input.stageId, input.conversionActionResource, input.transitionId];
  if (parts.some((part) => typeof part !== 'string' || !part.trim())) {
    throw new Error('Chave idempotente do Google exige tenant, lead, etapa, ação de conversão e transição.');
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(parts.map((part) => part.trim()))).digest('hex');
  return `gads:${digest}`;
}

export const googleConversionEventStates = ['PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'RETRY', 'FAILED'] as const;
export type GoogleConversionEventState = (typeof googleConversionEventStates)[number];

const STATE_TRANSITIONS: Record<GoogleConversionEventState, readonly GoogleConversionEventState[]> = {
  PENDING: ['SENT', 'RETRY', 'FAILED'],
  SENT: ['ACCEPTED', 'REJECTED', 'RETRY', 'FAILED'],
  RETRY: ['SENT', 'RETRY', 'FAILED'],
  // A failed event can only be reprocessed explicitly; it is never resent silently.
  FAILED: ['RETRY'],
  ACCEPTED: [],
  REJECTED: [],
};

export function canTransitionGoogleConversionEvent(from: GoogleConversionEventState, to: GoogleConversionEventState) {
  return STATE_TRANSITIONS[from].includes(to);
}

export function isTerminalGoogleConversionEventState(state: GoogleConversionEventState) {
  return STATE_TRANSITIONS[state].length === 0;
}

export const GOOGLE_CONVERSION_MAX_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 60_000;
const RETRY_MAX_DELAY_MS = 6 * 60 * 60_000;

/** `attempts` is the number of deliveries already tried, including the one that just failed. */
export function planGoogleConversionRetry(
  attempts: number,
): { state: 'RETRY'; delayMs: number } | { state: 'FAILED' } {
  if (!Number.isInteger(attempts) || attempts < 1) return { state: 'RETRY', delayMs: RETRY_BASE_DELAY_MS };
  if (attempts >= GOOGLE_CONVERSION_MAX_ATTEMPTS) return { state: 'FAILED' };
  return { state: 'RETRY', delayMs: Math.min(RETRY_BASE_DELAY_MS * 4 ** (attempts - 1), RETRY_MAX_DELAY_MS) };
}

/** Only a short symbolic code is stored for audit; provider messages and payloads are not. */
export function toSafeGoogleConversionErrorCode(value: unknown): string {
  if (typeof value !== 'string') return 'UNKNOWN';
  const code = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'UNKNOWN';
}
