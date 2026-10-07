import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { googleFunnelMappingSchema, type GoogleFunnelMappingInput } from './google-funnel';

/**
 * Tenant-scoped configuration of stage -> Google conversion action mappings.
 * Configuration only: nothing here creates, queues or sends a conversion.
 */

export const GOOGLE_FUNNEL_SCHEMA_PENDING_MESSAGE =
  'Funil Google Ads indisponível: as tabelas ainda não foram aplicadas neste ambiente.';

const DUPLICATE_MESSAGE = 'Esta ação de conversão já está mapeada para a etapa.';

export function isGoogleFunnelSchemaPendingError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2021' || error.code === 'P2022');
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function serializeGoogleFunnelMapping(mapping: {
  id: string;
  pipelineId: string;
  stageId: string;
  conversionActionResource: string;
  conversionActionName: string | null;
  conversionCategory: string;
  optimizationRole: string;
  valueMode: string;
  conversionValue: Prisma.Decimal | null;
  currency: string;
  triggerRule: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: mapping.id,
    pipelineId: mapping.pipelineId,
    stageId: mapping.stageId,
    conversionActionResource: mapping.conversionActionResource,
    conversionActionName: mapping.conversionActionName,
    conversionCategory: mapping.conversionCategory,
    optimizationRole: mapping.optimizationRole,
    valueMode: mapping.valueMode,
    conversionValue: mapping.conversionValue === null ? null : Number(mapping.conversionValue),
    currency: mapping.currency,
    triggerRule: mapping.triggerRule,
    enabled: mapping.enabled,
    createdAt: mapping.createdAt,
    updatedAt: mapping.updatedAt,
  };
}

export type SerializedGoogleFunnelMapping = ReturnType<typeof serializeGoogleFunnelMapping>;

export type GoogleFunnelMappingResult =
  | { ok: true; mapping: SerializedGoogleFunnelMapping }
  | { ok: false; status: 400 | 404 | 409; error: string };

function parseInput(body: unknown): { ok: true; data: GoogleFunnelMappingInput } | { ok: false; error: string } {
  const parsed = googleFunnelMappingSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message || 'Payload inválido' };
  return { ok: true, data: parsed.data };
}

function toMappingData(data: GoogleFunnelMappingInput) {
  return {
    pipelineId: data.pipelineId,
    stageId: data.stageId,
    conversionActionResource: data.conversionActionResource,
    conversionActionName: data.conversionActionName || null,
    conversionCategory: data.conversionCategory,
    optimizationRole: data.optimizationRole,
    valueMode: data.valueMode,
    conversionValue: data.valueMode === 'fixed' && typeof data.conversionValue === 'number'
      ? new Prisma.Decimal(data.conversionValue)
      : null,
    currency: data.currency,
    triggerRule: data.triggerRule,
    enabled: data.enabled,
  };
}

async function stageBelongsToTenant(tenantId: string, pipelineId: string, stageId: string) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId, isArchived: false, pipeline: { tenantId, isArchived: false } },
    select: { id: true },
  });
  return Boolean(stage);
}

export async function listGoogleFunnelMappings(tenantId: string) {
  const mappings = await prisma.googleConversionMapping.findMany({
    where: { tenantId, archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return mappings.map(serializeGoogleFunnelMapping);
}

export async function createGoogleFunnelMapping(params: {
  tenantId: string;
  userId: string;
  body: unknown;
}): Promise<GoogleFunnelMappingResult> {
  const input = parseInput(params.body);
  if (!input.ok) return { ok: false, status: 400, error: input.error };
  const data = toMappingData(input.data);
  if (!(await stageBelongsToTenant(params.tenantId, data.pipelineId, data.stageId))) {
    return { ok: false, status: 400, error: 'Etapa inválida para este tenant.' };
  }

  const existing = await prisma.googleConversionMapping.findFirst({
    where: { tenantId: params.tenantId, stageId: data.stageId, conversionActionResource: data.conversionActionResource },
    select: { id: true, archivedAt: true },
  });
  if (existing && !existing.archivedAt) return { ok: false, status: 409, error: DUPLICATE_MESSAGE };

  try {
    // An archived mapping is restored instead of duplicated, keeping its event history.
    const mapping = existing
      ? await prisma.googleConversionMapping.update({
          where: { id: existing.id },
          data: { ...data, archivedAt: null, updatedById: params.userId },
        })
      : await prisma.googleConversionMapping.create({
          data: { ...data, tenantId: params.tenantId, createdById: params.userId, updatedById: params.userId },
        });
    return { ok: true, mapping: serializeGoogleFunnelMapping(mapping) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, status: 409, error: DUPLICATE_MESSAGE };
    throw error;
  }
}

export async function updateGoogleFunnelMapping(params: {
  tenantId: string;
  userId: string;
  mappingId: string;
  body: unknown;
}): Promise<GoogleFunnelMappingResult> {
  const current = await prisma.googleConversionMapping.findFirst({
    where: { id: params.mappingId, tenantId: params.tenantId, archivedAt: null },
    select: { id: true },
  });
  if (!current) return { ok: false, status: 404, error: 'Mapeamento não encontrado.' };

  const input = parseInput(params.body);
  if (!input.ok) return { ok: false, status: 400, error: input.error };
  const data = toMappingData(input.data);
  if (!(await stageBelongsToTenant(params.tenantId, data.pipelineId, data.stageId))) {
    return { ok: false, status: 400, error: 'Etapa inválida para este tenant.' };
  }

  const conflict = await prisma.googleConversionMapping.findFirst({
    where: {
      id: { not: current.id },
      tenantId: params.tenantId,
      stageId: data.stageId,
      conversionActionResource: data.conversionActionResource,
    },
    select: { id: true },
  });
  if (conflict) return { ok: false, status: 409, error: DUPLICATE_MESSAGE };

  try {
    const mapping = await prisma.googleConversionMapping.update({
      where: { id: current.id },
      data: { ...data, updatedById: params.userId },
    });
    return { ok: true, mapping: serializeGoogleFunnelMapping(mapping) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, status: 409, error: DUPLICATE_MESSAGE };
    throw error;
  }
}

/** Removal is logical: the row and its event history are preserved. */
export async function archiveGoogleFunnelMapping(params: {
  tenantId: string;
  userId: string;
  mappingId: string;
}): Promise<{ ok: true } | { ok: false; status: 404; error: string }> {
  const current = await prisma.googleConversionMapping.findFirst({
    where: { id: params.mappingId, tenantId: params.tenantId, archivedAt: null },
    select: { id: true },
  });
  if (!current) return { ok: false, status: 404, error: 'Mapeamento não encontrado.' };
  await prisma.googleConversionMapping.update({
    where: { id: current.id },
    data: { enabled: false, archivedAt: new Date(), updatedById: params.userId },
  });
  return { ok: true };
}
