/**
 * What an anonymous chat visitor may read when the attendant cannot answer.
 * Wallet balance, billing and provider configuration are matters between the
 * platform and the tenant: the visitor only learns that service is unavailable.
 * The error code is unchanged, so logs and the tenant's own screens keep the cause.
 */
export const FLIP_AI_PUBLIC_UNAVAILABLE_MESSAGE = 'Atendimento indisponível no momento. Tente novamente mais tarde.';

const PLATFORM_ONLY_ERROR_CODES: ReadonlySet<string> = new Set([
  'FLIP_AI_CREDIT_BALANCE_INSUFFICIENT',
  'FLIP_AI_RUNTIME_BILLING_UNAVAILABLE',
  'FLIP_AI_CREDIT_SCHEMA_NOT_READY',
  'FLIP_AI_CREDIT_ACCOUNT_UNAVAILABLE',
  'OPENAI_API_KEY_MISSING',
]);

export function toPublicFlipAiErrorMessage(code: string, message: string): string {
  return PLATFORM_ONLY_ERROR_CODES.has(code) ? FLIP_AI_PUBLIC_UNAVAILABLE_MESSAGE : message;
}
