/**
 * Which stages the Flip AI may move a lead to, from what the company wrote for each stage.
 * Pure rules, kept apart from the database so they are easy to test.
 */
export const MANUAL_MOVE_COOLDOWN_HOURS = 24;

/** Starting texts for the usual stages of a law firm, matched by stage name. The team edits them. */
export const STAGE_CRITERION_EXAMPLES: Array<{ match: RegExp; criterion: string }> = [
  { match: /j[aá]\s*(é|e)\s*cliente/i, criterion: 'A pessoa diz que já tem processo ou que já é cliente do escritório.' },
  { match: /aguardando\s*doc/i, criterion: 'A IA pediu os documentos e a pessoa ainda não mandou nenhum.' },
  { match: /doc\S*\s+incomplet/i, criterion: 'A pessoa mandou só parte dos documentos pedidos.' },
  { match: /doc\S*\s+enviad/i, criterion: 'A pessoa mandou todos os documentos pedidos.' },
  { match: /fechad|assinad|protocol/i, criterion: 'A pessoa enviou a assinatura ou a procuração assinada.' },
];

export function exampleCriterionFor(stageName: string) {
  return STAGE_CRITERION_EXAMPLES.find((example) => example.match.test(stageName))?.criterion || '';
}

export type StageCandidate = { id: string; name: string; orderIndex: number; criterion: string };

/**
 * Stages the AI may suggest: enabled, with a criterion, and ahead of where the lead is.
 * The AI never moves a lead back, never touches a closed lead, and never right after a person moved it.
 */
export function candidateStages(input: {
  lead: { status: string; stageOrderIndex: number };
  stages: Array<{ id: string; name: string; orderIndex: number; isArchived: boolean; rule: { criterion: string; enabled: boolean } | null }>;
  lastManualMoveAt: Date | null;
  now: Date;
}): StageCandidate[] {
  if (input.lead.status !== 'open') return [];
  if (input.lastManualMoveAt
    && input.now.getTime() - input.lastManualMoveAt.getTime() < MANUAL_MOVE_COOLDOWN_HOURS * 3_600_000) return [];
  return input.stages
    .filter((stage) => !stage.isArchived && stage.rule?.enabled && stage.rule.criterion.trim()
      && stage.orderIndex > input.lead.stageOrderIndex)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((stage) => ({ id: stage.id, name: stage.name, orderIndex: stage.orderIndex, criterion: stage.rule!.criterion.trim() }));
}

/** The classifier may only answer with one of the stages it was offered. */
export function acceptedSuggestion(
  answer: { move: boolean; stageId: string | null; reason: string } | null,
  candidates: StageCandidate[],
) {
  if (!answer?.move || !answer.stageId) return null;
  const stage = candidates.find((candidate) => candidate.id === answer.stageId);
  const reason = answer.reason.replace(/\s+/g, ' ').trim().slice(0, 400);
  return stage && reason ? { stage, reason } : null;
}
