import { randomUUID } from 'node:crypto';

export type ApiV1ErrorCode =
  | 'api_unavailable'
  | 'invalid_credential'
  | 'permission_denied'
  | 'rate_limited'
  | 'dependency_unavailable'
  | 'invalid_request'
  | 'idempotency_conflict';

const PUBLIC_MESSAGES: Record<ApiV1ErrorCode, string> = {
  api_unavailable: 'Recurso indisponível.',
  invalid_credential: 'Credencial inválida.',
  permission_denied: 'Sem permissão.',
  rate_limited: 'Limite de requisições atingido.',
  dependency_unavailable: 'Serviço temporariamente indisponível.',
  invalid_request: 'Solicitação inválida.',
  idempotency_conflict: 'Chave de idempotência já utilizada para outra solicitação.',
};

export function apiV1Error(code: ApiV1ErrorCode, status: number) {
  return Response.json({
    code,
    message: PUBLIC_MESSAGES[code],
    requestId: randomUUID(),
  }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
