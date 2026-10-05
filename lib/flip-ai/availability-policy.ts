import { z } from 'zod';
import type { FlipAiActionEligibility, FlipAiActionPermission } from './action-eligibility';

export const FLIP_AI_AVAILABILITY_VERSION = '2026-10-05.1';

export const FLIP_AI_AVAILABILITY_MODALITIES = [
  'in_person_service',
  'customer_visit',
  'product_demo',
] as const;

export const FLIP_AI_AVAILABILITY_PERIODS = [
  'morning',
  'afternoon',
  'evening',
  'flexible',
] as const;

const textPatchSchema = z.object({
  action: z.enum(['keep', 'set', 'clear']),
  value: z.string().trim().min(1).max(80).nullable(),
}).strict();

const periodPatchSchema = z.object({
  action: z.enum(['keep', 'set', 'clear']),
  value: z.enum(FLIP_AI_AVAILABILITY_PERIODS).nullable(),
}).strict();

const timePatchSchema = z.object({
  action: z.enum(['keep', 'set', 'clear']),
  value: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).strict();

export const flipAiAvailabilityPatchSchema = z.object({
  preferredDate: textPatchSchema,
  preferredPeriod: periodPatchSchema,
  preferredTime: timePatchSchema,
}).strict();

export type FlipAiAvailabilityPatch = z.infer<typeof flipAiAvailabilityPatchSchema>;

export const EMPTY_FLIP_AI_AVAILABILITY_PATCH: FlipAiAvailabilityPatch = {
  preferredDate: { action: 'keep', value: null },
  preferredPeriod: { action: 'keep', value: null },
  preferredTime: { action: 'keep', value: null },
};

export type FlipAiAvailabilityModality = typeof FLIP_AI_AVAILABILITY_MODALITIES[number];
export type FlipAiAvailabilityPeriod = typeof FLIP_AI_AVAILABILITY_PERIODS[number];
export type FlipAiAvailabilityStatus = 'collecting' | 'partial' | 'ready_for_handoff';

export type FlipAiAvailabilitySnapshot = {
  version: string;
  modalities: FlipAiAvailabilityModality[];
  preferredDate: string | null;
  preferredPeriod: FlipAiAvailabilityPeriod | null;
  preferredTime: string | null;
  status: FlipAiAvailabilityStatus;
  updatedAt: string;
  sourceMessageId: string;
};

const snapshotSchema = z.object({
  version: z.string().min(1).max(40),
  modalities: z.array(z.enum(FLIP_AI_AVAILABILITY_MODALITIES)).min(1).max(3),
  preferredDate: z.string().trim().min(1).max(80).nullable(),
  preferredPeriod: z.enum(FLIP_AI_AVAILABILITY_PERIODS).nullable(),
  preferredTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
  status: z.enum(['collecting', 'partial', 'ready_for_handoff']),
  updatedAt: z.string().datetime(),
  sourceMessageId: z.string().uuid(),
}).strict();

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function applyPatch<T>(
  current: T | null,
  patch: { action: 'keep' | 'set' | 'clear'; value: T | null },
  normalize?: (value: T) => T,
): T | null {
  if (patch.action === 'keep') return current;
  if (patch.action === 'clear') return null;
  if (patch.value == null) return current;
  return normalize ? normalize(patch.value) : patch.value;
}

export function deriveAvailabilityModalities(
  eligibility: FlipAiActionEligibility,
): FlipAiAvailabilityModality[] {
  const modalities: FlipAiAvailabilityModality[] = [];
  if (eligibility.visitRequested) modalities.push('customer_visit');
  if (eligibility.productDemoRequested) modalities.push('product_demo');
  if (eligibility.inPersonRequested
    && !eligibility.visitRequested
    && !eligibility.productDemoRequested) {
    modalities.push('in_person_service');
  }
  return modalities;
}

function statusOf(input: {
  preferredDate: string | null;
  preferredPeriod: FlipAiAvailabilityPeriod | null;
  preferredTime: string | null;
}): FlipAiAvailabilityStatus {
  const hasDate = Boolean(input.preferredDate);
  const hasTimeWindow = Boolean(input.preferredPeriod || input.preferredTime);
  if (hasDate && hasTimeWindow) return 'ready_for_handoff';
  if (hasDate || hasTimeWindow) return 'partial';
  return 'collecting';
}

export function parseAvailabilitySnapshot(value: unknown): FlipAiAvailabilitySnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function mergeAvailabilitySnapshot(input: {
  previous?: FlipAiAvailabilitySnapshot | null;
  patch: FlipAiAvailabilityPatch;
  eligibility: FlipAiActionEligibility;
  permission: FlipAiActionPermission;
  sourceMessageId: string;
  updatedAt?: Date;
}): FlipAiAvailabilitySnapshot | null {
  if (!input.permission.mayCollectAvailability) return input.previous || null;

  const modalities = deriveAvailabilityModalities(input.eligibility);
  if (!modalities.length) return input.previous || null;

  const preferredDate = applyPatch(
    input.previous?.preferredDate || null,
    input.patch.preferredDate,
    (value) => normalizeText(value),
  );
  const preferredPeriod = applyPatch(
    input.previous?.preferredPeriod || null,
    input.patch.preferredPeriod,
  );
  const preferredTime = applyPatch(
    input.previous?.preferredTime || null,
    input.patch.preferredTime,
  );

  return {
    version: FLIP_AI_AVAILABILITY_VERSION,
    modalities,
    preferredDate,
    preferredPeriod,
    preferredTime,
    status: statusOf({ preferredDate, preferredPeriod, preferredTime }),
    updatedAt: (input.updatedAt || new Date()).toISOString(),
    sourceMessageId: input.sourceMessageId,
  };
}

export function availabilityPrompt(snapshot: FlipAiAvailabilitySnapshot | null) {
  if (!snapshot) return '';
  const fields = [
    snapshot.modalities.length ? `modalidades=${snapshot.modalities.join(',')}` : '',
    snapshot.preferredDate ? `data_preferida=${snapshot.preferredDate}` : '',
    snapshot.preferredPeriod ? `periodo=${snapshot.preferredPeriod}` : '',
    snapshot.preferredTime ? `horario=${snapshot.preferredTime}` : '',
    `status=${snapshot.status}`,
  ].filter(Boolean);
  return fields.join('; ');
}

export function availabilityPatchInstructions(permission: FlipAiActionPermission | null) {
  if (!permission?.mayCollectAvailability) {
    return [
      'availabilityPatch é interno e deve permanecer totalmente em keep neste turno.',
      'Não extraia data, período ou horário para agenda quando o backend não autorizou coleta de disponibilidade.',
    ];
  }

  return [
    'availabilityPatch é interno e registra somente preferências de disponibilidade explicitamente informadas pela pessoa.',
    'preferredDate preserva a forma curta dita pela pessoa, como "sexta-feira", "amanhã", "dia 12" ou "qualquer dia"; não converta datas relativas para ISO e não invente ano.',
    'preferredPeriod use morning, afternoon, evening ou flexible apenas quando a pessoa indicar o período.',
    'preferredTime use HH:MM apenas quando a pessoa disser um horário explícito; não transforme "à tarde" em um horário.',
    'Use keep quando aquele campo não mudou neste turno, set quando a pessoa informou/corrigiu o valor e clear somente quando ela retirar explicitamente aquela preferência.',
    'Não confirme disponibilidade, não diga que foi agendado e não crie compromisso.',
  ];
}
