/**
 * Overall score and suggested temperature for a finished Flip AI qualification.
 * Deterministic and computed from what the qualification already stores: no
 * AI call, no data sent anywhere, and nothing in the CRM is changed.
 *
 * It follows the live lead score policy (Fit 40 / Intent 30 / Urgency 15 /
 * Readiness 10 / Confidence 5), renormalised over the three components a
 * final qualification has.
 */
export const FLIP_AI_QUALIFICATION_SCORE_POLICY_VERSION = '2026-10-09.1';
/** A disqualified conversation never shows more than this, whatever the partial scores say. */
export const FLIP_AI_DISQUALIFIED_SCORE_CAP = 10;

const FIT_WEIGHT = 40 / 75;
const INTENT_WEIGHT = 30 / 75;
const CONFIDENCE_WEIGHT = 5 / 75;

export type FlipAiQualificationTemperature = 'hot' | 'warm' | 'cold' | 'unknown';

export type FlipAiQualificationScoreSummary = {
  policyVersion: string;
  score: number | null;
  temperature: FlipAiQualificationTemperature;
};

function bound(value: unknown, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

export function summarizeFlipAiQualificationScore(qualification: {
  classification?: string | null;
  fitScore?: number | null;
  intentScore?: number | null;
  confidence?: number | null;
}): FlipAiQualificationScoreSummary {
  // Without enough information there is no honest score to show.
  if (qualification.classification === 'insufficient' || !qualification.classification) {
    return { policyVersion: FLIP_AI_QUALIFICATION_SCORE_POLICY_VERSION, score: null, temperature: 'unknown' };
  }

  const weighted = Math.round(
    bound(qualification.fitScore, 100) * FIT_WEIGHT
      + bound(qualification.intentScore, 100) * INTENT_WEIGHT
      + bound(qualification.confidence, 1) * 100 * CONFIDENCE_WEIGHT,
  );
  const score = qualification.classification === 'disqualified'
    ? Math.min(weighted, FLIP_AI_DISQUALIFIED_SCORE_CAP)
    : weighted;

  const temperature: FlipAiQualificationTemperature = qualification.classification === 'qualified'
    ? 'hot'
    : qualification.classification === 'nurture' && score >= 50
      ? 'warm'
      : 'cold';

  return { policyVersion: FLIP_AI_QUALIFICATION_SCORE_POLICY_VERSION, score, temperature };
}
