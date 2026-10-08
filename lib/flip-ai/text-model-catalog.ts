/**
 * Text models the platform admin may activate for customer conversations.
 * A model is selectable only if it also has a price in openai-pricing.ts,
 * otherwise its usage could not be charged to tenant wallets.
 */
export const FLIP_AI_DEFAULT_TEXT_MODEL = 'gpt-5.6-luna';

export const FLIP_AI_TEXT_MODEL_CATALOG = [
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    description: 'Modelo em uso desde o lançamento do Flip AI.',
    inputUsdPerMillion: 0.2,
    outputUsdPerMillion: 1.2,
  },
  {
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    description: 'Geração seguinte da mesma linha, com cerca de metade do custo por token.',
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
  },
] as const;

export type FlipAiSelectableTextModel = (typeof FLIP_AI_TEXT_MODEL_CATALOG)[number]['id'];

export function isSelectableFlipAiTextModel(value: unknown): value is FlipAiSelectableTextModel {
  return typeof value === 'string' && FLIP_AI_TEXT_MODEL_CATALOG.some((model) => model.id === value);
}
