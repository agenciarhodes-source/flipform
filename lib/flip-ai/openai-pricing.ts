export const OPENAI_PRICE_SNAPSHOT = '2026-09-30';
export const OPENAI_PRICE_SOURCE = 'https://developers.openai.com/api/docs/pricing';

export type OpenAiCostCoverage = 'full' | 'partial' | 'none';

export type OpenAiUsageCostInput = {
  operation: string;
  model: string;
  confirmedEvents: number;
  inputTokens: number;
  outputTokens: number;
};

export type OpenAiUsageCostEstimate = {
  costNanoUsd: number;
  coverage: OpenAiCostCoverage;
  reason: 'realtime_not_reconciled' | 'unknown_model' | null;
};

type TokenPrice = {
  inputNanoUsd: number;
  outputNanoUsd: number;
};

const TOKEN_PRICES: Array<{ matches: (model: string) => boolean; price: TokenPrice }> = [
  {
    matches: (model) => model === 'gpt-5.6-luna' || model.startsWith('gpt-5.6-luna-'),
    price: { inputNanoUsd: 200, outputNanoUsd: 1_200 },
  },
  {
    matches: (model) => model === 'text-embedding-3-small'
      || model.startsWith('text-embedding-3-small-'),
    price: { inputNanoUsd: 20, outputNanoUsd: 0 },
  },
];

const WEB_SEARCH_CALL_NANO_USD = 10_000_000;

function safeCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function tokenPrice(model: string) {
  return TOKEN_PRICES.find((entry) => entry.matches(model.trim()))?.price || null;
}

export function estimateOpenAiUsageCost(
  input: OpenAiUsageCostInput,
): OpenAiUsageCostEstimate {
  const confirmedEvents = safeCount(input.confirmedEvents);
  const inputTokens = safeCount(input.inputTokens);
  const outputTokens = safeCount(input.outputTokens);

  if (input.operation === 'realtime_session') {
    return {
      costNanoUsd: 0,
      coverage: 'none',
      reason: 'realtime_not_reconciled',
    };
  }

  const price = tokenPrice(input.model);
  const toolCost = input.operation === 'web_search'
    ? confirmedEvents * WEB_SEARCH_CALL_NANO_USD
    : 0;

  if (!price) {
    return {
      costNanoUsd: toolCost,
      coverage: toolCost > 0 ? 'partial' : 'none',
      reason: 'unknown_model',
    };
  }

  const tokenCost = inputTokens * price.inputNanoUsd
    + outputTokens * price.outputNanoUsd;
  const costNanoUsd = tokenCost + toolCost;
  if (!Number.isSafeInteger(costNanoUsd) || costNanoUsd < 0) {
    return { costNanoUsd: 0, coverage: 'none', reason: 'unknown_model' };
  }
  return { costNanoUsd, coverage: 'full', reason: null };
}

export function nanoUsdToUsd(costNanoUsd: number) {
  return safeCount(costNanoUsd) / 1_000_000_000;
}
