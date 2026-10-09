import { brainAssessmentSchema, classifyBrainAssessment, type BrainAssessment } from './brain-profiles';
import {
  normalizeActionSignals,
  resolveFlipAiActionEligibility,
  resolveFlipAiActionPermission,
  type FlipAiActionEligibility,
  type FlipAiActionPermission,
} from './action-eligibility';
import type { FlipAiActionCapabilities } from './action-capabilities';

import { FLIP_AI_DISQUALIFIED_SCORE_CAP } from './qualification-score';
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

export type FlipAiLeadTemperature = 'hot' | 'warm' | 'cold' | 'unknown';

export type FlipAiLeadIntelligenceSnapshot = {
  source: 'jev';
  brainAssessment?: BrainAssessment;
  policyVersion: string;
  score: number | null;
  classification: FlipAiLiveClassification;
  temperature: FlipAiLeadTemperature;
  fitScore: number;
  intentScore: number;
  urgencyScore: number;
  readinessScore: number;
  confidenceScore: number;
  intent: FlipAiConversationDecision['intent'];
  objection: FlipAiConversationDecision['objection'];
  journeyStage: FlipAiConversationDecision['journeyStage'];
  nextAction: FlipAiConversationDecision['nextAction'];
  actionEligibility: FlipAiActionEligibility;
  actionPermission: FlipAiActionPermission;
  needsHuman: boolean;
  confidence: number;
  scoreDelta: number | null;
  updatedAt: string;
  conversationId: string;
  usageEventId: string;
  /** Set when the finished qualification of the conversation overrode the per-message reading. */
  finalQualificationApplied?: boolean;
};

/**
 * The per-message reading only sees the latest turn; the finished qualification saw the whole
 * conversation. When that one says disqualified, the lead card must not show a warmer picture.
 */
export function applyFinalDisqualification(
  snapshot: FlipAiLeadIntelligenceSnapshot,
  final: { fitScore: number; intentScore: number },
): FlipAiLeadIntelligenceSnapshot {
  return {
    ...snapshot,
    classification: 'disqualified',
    temperature: 'cold',
    score: Math.min(snapshot.score ?? 0, FLIP_AI_DISQUALIFIED_SCORE_CAP),
    fitScore: Math.min(snapshot.fitScore, boundScore(final.fitScore)),
    intentScore: Math.min(snapshot.intentScore, boundScore(final.intentScore)),
    scoreDelta: null,
    finalQualificationApplied: true,
  };
}

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
    || (raw.intentScore !== undefined && typeof raw.intentScore !== 'number')
    || typeof raw.urgencyScore !== 'number'
    || (raw.readinessScore !== undefined && typeof raw.readinessScore !== 'number')
    || typeof raw.needsHuman !== 'boolean'
    || (raw.actionSignals !== undefined && (
      !raw.actionSignals
      || typeof raw.actionSignals !== 'object'
      || Array.isArray(raw.actionSignals)
    ))
    || typeof raw.confidence !== 'number'
    || typeof raw.intentConfidence !== 'number'
    || typeof raw.objectionConfidence !== 'number'
    || typeof raw.stageConfidence !== 'number') {
    return null;
  }
  const assessment = raw.brainAssessment === undefined ? null : brainAssessmentSchema.safeParse(raw.brainAssessment);
  if (assessment && !assessment.success) return null;
  return {
    ...(assessment?.success ? { brainAssessment: assessment.data } : {}),
    engine: 'jev',
    engineVersion: raw.engineVersion,
    model: raw.model,
    intent: raw.intent,
    objection: raw.objection,
    journeyStage: raw.journeyStage,
    nextAction: raw.nextAction,
    fitScore: boundScore(raw.fitScore),
    ...(typeof raw.intentScore === 'number' ? { intentScore: boundScore(raw.intentScore) } : {}),
    urgencyScore: boundScore(raw.urgencyScore),
    ...(typeof raw.readinessScore === 'number' ? { readinessScore: boundScore(raw.readinessScore) } : {}),
    needsHuman: raw.needsHuman,
    ...(raw.actionSignals && typeof raw.actionSignals === 'object' && !Array.isArray(raw.actionSignals)
      ? (() => {
        const signals = raw.actionSignals as Record<string, unknown>;
        return {
          actionSignals: normalizeActionSignals({
            humanHandoffInterest: typeof signals.humanHandoffInterest === 'number'
              ? signals.humanHandoffInterest : undefined,
            inPersonInterest: typeof signals.inPersonInterest === 'number'
              ? signals.inPersonInterest : undefined,
            visitInterest: typeof signals.visitInterest === 'number'
              ? signals.visitInterest : undefined,
            productDemoInterest: typeof signals.productDemoInterest === 'number'
              ? signals.productDemoInterest : undefined,
            schedulingInterest: typeof signals.schedulingInterest === 'number'
              ? signals.schedulingInterest : undefined,
          }),
        };
      })()
      : {}),
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    intentConfidence: Math.max(0, Math.min(1, raw.intentConfidence)),
    objectionConfidence: Math.max(0, Math.min(1, raw.objectionConfidence)),
    stageConfidence: Math.max(0, Math.min(1, raw.stageConfidence)),
  };
}

export function calculateFlipAiLeadScore(decision: FlipAiConversationDecision) {
  const fitScore = boundScore(decision.fitScore);
  const intentScore = typeof decision.intentScore === 'number'
    ? boundScore(decision.intentScore)
    : INTENT_STRENGTH[decision.intent];
  const urgencyScore = boundScore(decision.urgencyScore);
  const readinessScore = typeof decision.readinessScore === 'number'
    ? boundScore(decision.readinessScore)
    : JOURNEY_STRENGTH[decision.journeyStage];
  const confidenceScore = boundScore(decision.confidence * 100);

  let score: number | null = boundScore(
    fitScore * 0.40
      + intentScore * 0.30
      + urgencyScore * 0.15
      + readinessScore * 0.10
      + confidenceScore * 0.05,
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

  if (decision.brainAssessment) {
    const assessment = decision.brainAssessment;
    score = assessment.score;
    classification = classifyBrainAssessment(assessment);
  }

  const temperature: FlipAiLeadTemperature = score === null ? 'unknown' : classification === 'qualified'
    ? 'hot'
    : classification === 'nurture' && score >= 50
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
      readinessScore,
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
  actionCapabilities?: FlipAiActionCapabilities | null;
}): FlipAiLeadIntelligenceSnapshot {
  const current = calculateFlipAiLeadScore(input.decision);
  const previous = input.previousDecision
    ? calculateFlipAiLeadScore(input.previousDecision)
    : null;
  const actionEligibility = resolveFlipAiActionEligibility({
    rawNextAction: input.decision.nextAction,
    signals: input.decision.actionSignals,
    needsHuman: input.decision.needsHuman,
  });
  const actionPermission = resolveFlipAiActionPermission({
    eligibility: actionEligibility,
    capabilities: input.actionCapabilities,
  });

  return {
    source: 'jev',
    policyVersion: input.decision.brainAssessment ? 'brain-profile-v1' : FLIP_AI_LEAD_SCORE_POLICY_VERSION,
    ...(input.decision.brainAssessment ? { brainAssessment: input.decision.brainAssessment } : {}),
    score: current.score,
    classification: current.classification,
    temperature: current.temperature,
    ...current.components,
    intent: input.decision.intent,
    objection: input.decision.objection,
    journeyStage: input.decision.journeyStage,
    nextAction: actionPermission.effectiveNextAction,
    actionEligibility,
    actionPermission,
    needsHuman: input.decision.needsHuman,
    confidence: input.decision.confidence,
    scoreDelta: previous && current.score !== null && previous.score !== null && (input.decision.brainAssessment
      ? input.decision.brainAssessment.status === 'complete'
        && input.previousDecision?.brainAssessment?.status === 'complete'
        && input.decision.brainAssessment.profileId === input.previousDecision.brainAssessment.profileId
        && input.decision.brainAssessment.contentHash === input.previousDecision.brainAssessment.contentHash
      : !input.previousDecision?.brainAssessment)
      ? current.score - previous.score : null,
    updatedAt: input.updatedAt.toISOString(),
    conversationId: input.conversationId,
    usageEventId: input.usageEventId,
  };
}
