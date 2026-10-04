import 'server-only';

import { FlipAiError } from './access';
import { getFlipAiCreditBalanceForTenant } from './credits';
import {
  FLIP_AI_TEXT_MODEL,
  streamOpenAiText,
  type OpenAiConversationInput,
  type OpenAiJsonSchemaFormat,
  type OpenAiTextResult,
} from './openai-responses';

export const FLIP_AI_CONVERSATION_RUNTIME_VERSION = '2026-10-04.1';

export type FlipAiConversationExecutionPlan = {
  runtimeVersion: string;
  provider: 'openai';
  model: string;
  modality: 'text';
  task: 'customer_conversation';
  modelRouting: 'disabled';
};

export class FlipAiConversationRuntimeError extends FlipAiError {
  readonly kind = 'definitive' as const;
}

export function getFlipAiConversationExecutionPlan(): FlipAiConversationExecutionPlan {
  return {
    runtimeVersion: FLIP_AI_CONVERSATION_RUNTIME_VERSION,
    provider: 'openai',
    model: FLIP_AI_TEXT_MODEL,
    modality: 'text',
    task: 'customer_conversation',
    modelRouting: 'disabled',
  };
}

export async function assertFlipAiConversationRuntimeReady(input: {
  tenantId: string;
}) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new FlipAiConversationRuntimeError(
      'OPENAI_API_KEY_MISSING',
      503,
      'O atendimento por IA está temporariamente indisponível.',
    );
  }

  const wallet = await getFlipAiCreditBalanceForTenant(input.tenantId);
  if (!wallet.available) {
    throw new FlipAiConversationRuntimeError(
      'FLIP_AI_RUNTIME_BILLING_UNAVAILABLE',
      503,
      'A carteira Flip AI está temporariamente indisponível.',
    );
  }
  if (wallet.balanceCredits <= 0) {
    throw new FlipAiConversationRuntimeError(
      'FLIP_AI_CREDIT_BALANCE_INSUFFICIENT',
      402,
      'Saldo de créditos Flip AI insuficiente. Adicione créditos para continuar.',
    );
  }

  return {
    ...getFlipAiConversationExecutionPlan(),
    balanceCredits: wallet.balanceCredits,
  };
}

export async function executeFlipAiConversationResponse(input: {
  tenantId: string;
  conversationId: string;
  agentId: string;
  context: OpenAiConversationInput;
  textFormat: OpenAiJsonSchemaFormat;
  timeoutMs?: number;
  onDelta?: (delta: string) => void | Promise<void>;
}): Promise<OpenAiTextResult> {
  const plan = await assertFlipAiConversationRuntimeReady({ tenantId: input.tenantId });

  return streamOpenAiText(
    input.context,
    input.onDelta || (() => undefined),
    {
      timeoutMs: input.timeoutMs || 55_000,
      model: plan.model,
      textFormat: input.textFormat,
      safetyIdentifier: input.conversationId,
      promptCacheKey: input.agentId,
    },
  );
}
