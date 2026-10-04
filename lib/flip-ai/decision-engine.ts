export const FLIP_AI_DECISION_ENGINE_VERSION = '2026-10-04.1';

export const JEV_INTENTS = [
  'information',
  'qualification',
  'objection',
  'scheduling',
  'purchase',
  'support',
  'handoff',
  'other',
] as const;

export const JEV_OBJECTIONS = [
  'none',
  'price',
  'trust',
  'timing',
  'documentation',
  'eligibility',
  'competitor',
  'uncertainty',
  'other',
] as const;

export const JEV_JOURNEY_STAGES = [
  'discovery',
  'consideration',
  'decision',
  'post_sale',
  'unknown',
] as const;

export const JEV_NEXT_ACTIONS = [
  'answer_directly',
  'ask_one_question',
  'handle_objection',
  'request_contact',
  'schedule',
  'handoff',
] as const;

export type FlipAiConversationDecision = {
  engine: 'jev';
  engineVersion: string;
  model: string;
  intent: typeof JEV_INTENTS[number];
  objection: typeof JEV_OBJECTIONS[number];
  journeyStage: typeof JEV_JOURNEY_STAGES[number];
  nextAction: typeof JEV_NEXT_ACTIONS[number];
  fitScore: number;
  urgencyScore: number;
  needsHuman: boolean;
  confidence: number;
  intentConfidence: number;
  objectionConfidence: number;
  stageConfidence: number;
};

function boundedScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeJevOrdinalScore(value: number, maxIndex = 4) {
  if (!Number.isFinite(value) || maxIndex <= 0) return 0;
  return boundedScore((Math.max(0, Math.min(maxIndex, value)) / maxIndex) * 100);
}

export function combineDecisionConfidence(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
  if (!valid.length) return 0;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 1000) / 1000;
}

export function parseJevEnabled(raw: string | undefined) {
  return String(raw || '').trim().toLowerCase() === 'true';
}

export function parseJevTenantIds(raw: string | undefined) {
  if (!raw?.trim()) return { configured: false, valid: true, tenantIds: [] as string[] };
  const values = raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const unique = [...new Set(values)];
  const valid = values.length <= 100 && unique.length === values.length && unique.every((value) => UUID.test(value));
  return {
    configured: true,
    valid,
    tenantIds: valid ? unique : [],
  };
}

export function isJevEnabledForTenant(input: {
  tenantId: string;
  enabledRaw?: string;
  tenantIdsRaw?: string;
}) {
  if (!parseJevEnabled(input.enabledRaw)) return false;
  const allowlist = parseJevTenantIds(input.tenantIdsRaw);
  return allowlist.configured && allowlist.valid
    && allowlist.tenantIds.includes(input.tenantId.trim().toLowerCase());
}

export function decisionHint(decision: FlipAiConversationDecision | null) {
  if (!decision) return null;
  return [
    `intenção=${decision.intent}`,
    `objeção=${decision.objection}`,
    `estágio=${decision.journeyStage}`,
    `fit=${decision.fitScore}/100`,
    `urgência=${decision.urgencyScore}/100`,
    `próxima_ação=${decision.nextAction}`,
    `humano=${decision.needsHuman ? 'sim' : 'não'}`,
    `confiança=${decision.confidence.toFixed(2)}`,
  ].join('; ');
}
