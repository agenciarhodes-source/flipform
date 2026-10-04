import {
  JEV_INTENTS,
  JEV_JOURNEY_STAGES,
  JEV_NEXT_ACTIONS,
  JEV_OBJECTIONS,
  type FlipAiConversationDecision,
} from './decision-engine';

export const FLIP_AI_LEAD_SCORE_POLICY_VERSION = '2026-10-04.1';

export type FlipAiLiveClassification =
  | 'qualified'
  | 'nurture'
  | 'disqualified'
  | 'insufficient';

export type FlipAiLeadTemperature = 'hot' | 'warm' | 'cold';

export type FlipAiLeadIntelligenceSnapshot = {
  source: 'jev';
  policyVersion: string;
  score: number;
  classification: FlipAiLiveClassification;
  temperature: FlipAiLeadTemperature;
  fitScore: number;
  intentScore: number;
  urgencyScore: number;
  journeyScore: number;
  confidenceScore: number;
  intent: FlipAiConversationDecision['intent'];
  objection: FlipAiConversationDecision['objection'];
  journeyStage: FlipAiConversationDecision['journeyStage'];
  nextAction: FlipAiConversationDecision['nextAction'];
  needsHuman: boolean;
  confidence: number;
  scoreDelta: number | null;
  updatedAt: string;
  conversationId: string;
  usageEventId: string;
};

const INTENT_STRENGTH: Record<FlipAiConversationDecision['intent'], number> = {
  information: 45,
  qualification: 65,
  objection: 60,
  scheduling: 90,
  purchase: 100,
  support: 35,
  handoff: 80,
  other: 40,
};

const JOURNEY_STRENGTH: Record<FlipAiConversationDecision['journeyStage'], number> = {
  discovery: 35,
  consideration: 70,
  decision: 100,
  post_sale: 100,
  unknown: 25,
};

function boundScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number]);
}

export function parseConversationDecision(value: unknown): FlipAiConversationDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.engine !== 'jev'
    || typeof raw.engineVersion !== 'string'
    || typeof raw.model !== 'string'
    || !oneOf(raw.intent, JEV_INTENTS)
    || !oneOf(raw.objection, JEV_OBJECTIONS)
    || !oneOf(raw.journeyStage, JEV_JOURNEY_STAGES)
    || !oneOf(raw.nextAction, JEV_NEXT_ACTIONS)
    || typeof raw.fitScore !== 'number'
    || typeof raw.urgencyScore !== 'number'
    || typeof raw.needsHuman !== 'boolean'
    || typeof raw.confidence !== 'number'
    || typeof raw.intentConfidence !== 'number'
    || typeof raw.objectionConfidence !== 'number'
    || typeof raw.stageConfidence !== 'number') {
    return null;
  }
  return {
    engine: 'jev',
    engineVersion: raw.engineVersion,
    model: raw.model,
    intent: raw.intent,
    objection: raw.objection,
    journeyStage: raw.journeyStage,
    nextAction: raw.nextAction,
    fitScore: boundScore(raw.fitScore),
    urgencyScore: boundScore(raw.urgencyScore),
    needsHuman: raw.needsHuman,
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    intentConfidence: Math.max(0, Math.min(1, raw.intentConfidence)),
    objectionConfidence: Math.max(0, Math.min(1, raw.objectionConfidence)),
    stageConfidence: Math.max(0, Math.min(1, raw.stageConfidence)),
  };
}

export function calculateFlipAiLeadScore(decision: FlipAiConversationDecision) {
  const fitScore = boundScore(decision.fitScore);
  const intentScore = INTENT_STRENGTH[decision.intent];
  const urgencyScore = boundScore(decision.urgencyScore);
  const journeyScore = JOURNEY_STRENGTH[decision.journeyStage];
  const confidenceScore = boundScore(decision.confidence * 100);

  const score = boundScore(
    fitScore * 0.40
      + intentScore * 0.25
      + urgencyScore * 0.15
      + journeyScore * 0.10
      + confidenceScore * 0.10,
  );

  let classification: FlipAiLiveClassification;
  if (decision.confidence < 0.50) {
    classification = 'insufficient';
  } else if (fitScore <= 25 && decision.confidence >= 0.65) {
    classification = 'disqualified';
  } else if (score >= 75 && fitScore >= 60 && decision.confidence >= 0.60) {
    classification = 'qualified';
  } else if (score >= 45 || fitScore >= 50) {
    classification = 'nurture';
  } else {
    classification = 'insufficient';
  }

  const temperature: FlipAiLeadTemperature = score >= 75
    ? 'hot'
    : score >= 50
      ? 'warm'
      : 'cold';

  return {
    score,
    classification,
    temperature,
    components: {
      fitScore,
      intentScore,
      urgencyScore,
      journeyScore,
      confidenceScore,
    },
  };
}

export function buildFlipAiLeadIntelligenceSnapshot(input: {
  decision: FlipAiConversationDecision;
  previousDecision?: FlipAiConversationDecision | null;
  updatedAt: Date;
  conversationId: string;
  usageEventId: string;
}): FlipAiLeadIntelligenceSnapshot {
  const current = calculateFlipAiLeadScore(input.decision);
  const previous = input.previousDecision
    ? calculateFlipAiLeadScore(input.previousDecision)
    : null;

  return {
    source: 'jev',
    policyVersion: FLIP_AI_LEAD_SCORE_POLICY_VERSION,
    score: current.score,
    classification: current.classification,
    temperature: current.temperature,
    ...current.components,
    intent: input.decision.intent,
    objection: input.decision.objection,
    journeyStage: input.decision.journeyStage,
    nextAction: input.decision.nextAction,
    needsHuman: input.decision.needsHuman,
    confidence: input.decision.confidence,
    scoreDelta: previous ? current.score - previous.score : null,
    updatedAt: input.updatedAt.toISOString(),
    conversationId: input.conversationId,
    usageEventId: input.usageEventId,
  };
}
