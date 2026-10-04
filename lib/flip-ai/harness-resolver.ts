import type { FlipAiConversationDecision } from './decision-engine';

export const FLIP_AI_HARNESS_DEFAULT_TOKEN_BUDGET = 1_200;
export const FLIP_AI_HISTORY_DEFAULT_CHAR_BUDGET = 8_000;
export const FLIP_AI_HISTORY_MAX_MESSAGES = 10;

export type HarnessCandidate = {
  id: string;
  heading: string | null;
  content: string;
  score: number;
  tokenEstimate?: number;
};

function compact(value: string, max = 2_000) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function resolveHarnessTokenBudget(raw: string | undefined) {
  const parsed = Number.parseInt(String(raw || ''), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 400 || parsed > 3_000) {
    return FLIP_AI_HARNESS_DEFAULT_TOKEN_BUDGET;
  }
  return parsed;
}

export function buildHarnessRetrievalQueries(input: {
  message: string;
  entryContext?: string | null;
  decision?: FlipAiConversationDecision | null;
}) {
  const base = [
    compact(input.message, 1_600),
    input.entryContext ? `Contexto de entrada: ${compact(input.entryContext, 600)}` : '',
  ].filter(Boolean).join('\n');

  if (!input.decision || input.decision.confidence < 0.52) {
    return {
      conversationQuery: base,
      qualificationQuery:
        'Critérios de qualificação, perfil ideal, quem não atendemos, urgência, intenção, timing e próxima ação.',
      decisionApplied: false,
    };
  }

  const d = input.decision;
  return {
    conversationQuery: [
      base,
      `Intenção atual: ${d.intent}.`,
      d.objection !== 'none' ? `Objeção atual: ${d.objection}.` : '',
      `Estágio da jornada: ${d.journeyStage}.`,
      `Próxima ação sugerida: ${d.nextAction}.`,
    ].filter(Boolean).join('\n'),
    qualificationQuery: [
      'Critérios de qualificação e perfil ideal aplicáveis ao contexto atual.',
      `Fit estimado: ${d.fitScore}/100.`,
      `Urgência estimada: ${d.urgencyScore}/100.`,
      `Estágio: ${d.journeyStage}.`,
      d.needsHuman ? 'Verifique regras de encaminhamento para atendimento humano.' : '',
      d.objection !== 'none' ? `Recupere orientação para tratar objeção de ${d.objection}.` : '',
    ].filter(Boolean).join(' '),
    decisionApplied: true,
  };
}

function estimatedTokens(candidate: HarnessCandidate) {
  if (Number.isSafeInteger(candidate.tokenEstimate) && candidate.tokenEstimate > 0) {
    return candidate.tokenEstimate;
  }
  return Math.max(1, Math.ceil(candidate.content.length / 4));
}

export function selectHarnessHits(
  candidates: HarnessCandidate[],
  tokenBudget = FLIP_AI_HARNESS_DEFAULT_TOKEN_BUDGET,
) {
  const budget = Math.max(400, Math.min(3_000, Math.trunc(tokenBudget)));
  const unique = candidates
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((left, right) => right.score - left.score);

  const selected: HarnessCandidate[] = [];
  let selectedTokens = 0;
  const candidateTokens = unique.reduce((sum, item) => sum + estimatedTokens(item), 0);

  for (const candidate of unique) {
    const tokens = estimatedTokens(candidate);
    if (selected.length && selectedTokens + tokens > budget) continue;
    selected.push(candidate);
    selectedTokens += tokens;
    if (selected.length >= 5 || selectedTokens >= budget) break;
  }

  if (!selected.length && unique.length) {
    selected.push(unique[0]);
    selectedTokens = Math.min(estimatedTokens(unique[0]), budget);
  }

  return {
    hits: selected,
    metrics: {
      tokenBudget: budget,
      candidateCount: unique.length,
      selectedCount: selected.length,
      candidateTokens,
      selectedTokens,
      avoidedTokens: Math.max(0, candidateTokens - selectedTokens),
      savingsPercent: candidateTokens > 0
        ? Math.round((Math.max(0, candidateTokens - selectedTokens) / candidateTokens) * 10_000) / 100
        : 0,
    },
  };
}

export function buildBudgetedHistory(
  messages: Array<{ id?: string; role: 'user' | 'assistant'; content: string }>,
  charBudget = FLIP_AI_HISTORY_DEFAULT_CHAR_BUDGET,
) {
  const budget = Math.max(2_000, Math.min(16_000, Math.trunc(charBudget)));
  const newestFirst = [...messages].reverse();
  const selected: Array<{ id?: string; role: 'user' | 'assistant'; content: string }> = [];
  let chars = 0;

  for (const message of newestFirst) {
    if (selected.length >= FLIP_AI_HISTORY_MAX_MESSAGES) break;
    const content = message.content.trim().slice(0, 2_000);
    if (!content) continue;
    const remaining = budget - chars;
    if (remaining <= 0) break;
    const bounded = content.slice(Math.max(0, content.length - remaining));
    selected.push({ id: message.id, role: message.role, content: bounded });
    chars += bounded.length;
  }

  return {
    messages: selected.reverse(),
    metrics: {
      availableMessages: messages.length,
      selectedMessages: selected.length,
      selectedChars: chars,
      charBudget: budget,
    },
  };
}
