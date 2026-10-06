const SAFE_JEV_ERROR_CODES = new Set([
  'TYPESAFE_API_KEY_MISSING',
  'JEV_TRANSPORT_FAILED',
  'JEV_REQUEST_TOO_LARGE',
  'JEV_RESPONSE_INVALID',
  'JEV_RESPONSE_TOO_LARGE',
  'JEV_READINESS_RESPONSE_INVALID',
  'JEV_READINESS_DECISION_INVALID',
  'JEV_PROFILE_RESPONSE_INVALID',
  'JEV_PROFILE_CHOICE_INVALID',
  'JEV_DECISION_INVALID',
]);

type JevErrorFallback = 'JEV_RUNTIME_FAILED' | 'JEV_READINESS_FAILED';

/**
 * Converts provider/runtime failures into a closed set of diagnostic codes.
 * Raw exception messages may contain database details, URLs, credentials or
 * customer content and must never cross the JEV persistence/API boundary.
 */
export function safeJevErrorCode(
  error: unknown,
  fallback: JevErrorFallback = 'JEV_RUNTIME_FAILED',
) {
  const candidate = error instanceof Error ? error.message : '';
  if (/^JEV_HTTP_[1-5]\d{2}$/.test(candidate) || SAFE_JEV_ERROR_CODES.has(candidate)) {
    return candidate;
  }
  return fallback;
}
