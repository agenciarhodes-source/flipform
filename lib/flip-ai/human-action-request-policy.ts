import { createHash } from 'node:crypto';
import type { FlipAiAvailabilitySnapshot } from './availability-policy';

export const FLIP_AI_HUMAN_ACTION_REQUEST_VERSION = '2026-10-05.1';
export const FLIP_AI_HUMAN_ACTION_REQUEST_TITLE = 'Confirmar atendimento presencial — Flip AI';

export type FlipAiHumanActionRequestResolution =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'completed';

const periodLabels: Record<string, string> = {
  morning: 'manhã',
  afternoon: 'tarde',
  evening: 'noite',
  flexible: 'flexível',
};

const modalityLabels: Record<string, string> = {
  in_person_service: 'atendimento presencial',
  customer_visit: 'visita ao cliente',
  product_demo: 'demonstração presencial',
};

function uuidFromHash(value: string) {
  const bytes = Buffer.from(createHash('sha256').update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function flipAiHumanActionRequestTaskId(input: {
  tenantId: string;
  conversationId: string;
}) {
  return uuidFromHash(
    `flip-ai:human-action-request:${input.tenantId}:${input.conversationId}:in-person-confirmation`,
  );
}

export function flipAiHumanActionRequestKey(input: {
  tenantId: string;
  conversationId: string;
}) {
  return `flip-ai-action-request:${input.tenantId}:${input.conversationId}:in-person-confirmation`;
}

export function buildFlipAiHumanActionRequestDescription(
  availability: FlipAiAvailabilitySnapshot,
) {
  const modalities = availability.modalities
    .map((item) => modalityLabels[item] || item)
    .join(', ');
  const lines = [
    'O Flip AI coletou uma preferência de atendimento presencial pronta para confirmação humana.',
    '',
    `Modalidade: ${modalities || 'não definida'}`,
    `Dia/data preferida: ${availability.preferredDate || 'não informado'}`,
    `Período preferido: ${availability.preferredPeriod
      ? periodLabels[availability.preferredPeriod] || availability.preferredPeriod
      : 'não informado'}`,
    `Horário preferido: ${availability.preferredTime || 'não informado'}`,
    '',
    'Nenhum horário foi reservado ou confirmado. Confirme a disponibilidade com a pessoa antes de assumir qualquer compromisso.',
  ];
  return lines.join('\n').slice(0, 2_000);
}

export function humanActionRequestAuditMetadata(input: {
  leadId: string;
  conversationId: string;
  agentId?: string | null;
  availability: FlipAiAvailabilitySnapshot;
  assignedTo?: string | null;
}) {
  return {
    source: 'flip_ai',
    requestType: 'in_person_confirmation',
    version: FLIP_AI_HUMAN_ACTION_REQUEST_VERSION,
    leadId: input.leadId,
    conversationId: input.conversationId,
    agentId: input.agentId || null,
    assignedTo: input.assignedTo || null,
    availabilityVersion: input.availability.version,
    modalities: input.availability.modalities,
    preferredDate: input.availability.preferredDate,
    preferredPeriod: input.availability.preferredPeriod,
    preferredTime: input.availability.preferredTime,
  };
}
