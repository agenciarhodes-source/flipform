export type MetaConnectionHealthState =
  | 'healthy'
  | 'degraded'
  | 'action_required'
  | 'expired'
  | 'revoked'
  | 'provider_error'
  | 'not_connected';

export type MetaConnectionHealthCheck = {
  key: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

export type MetaConnectionHealth = {
  state: MetaConnectionHealthState;
  label: string;
  summary: string;
  checkedAt: string;
  lastValidatedAt: string | null;
  reconnectRecommended: boolean;
  retryable: boolean;
  checks: MetaConnectionHealthCheck[];
};

export type HealthAuditSnapshot = {
  state: MetaConnectionHealthState;
  reason: string;
  createdAt: Date;
} | null;

export type ProviderFailure = {
  state: 'action_required' | 'provider_error';
  reason: string;
  providerStatus: number | null;
  providerCode: string | null;
};

export function classifyMetaConnectionProviderError(error: unknown): ProviderFailure {
  const statusRaw = error && typeof error === 'object' ? (error as any).status : null;
  const status = typeof statusRaw === 'number' && Number.isFinite(statusRaw) ? statusRaw : null;
  const providerCodeRaw = error && typeof error === 'object' ? (error as any).providerCode : null;
  const providerCode = providerCodeRaw == null ? null : String(providerCodeRaw);
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (status === 429 || (status !== null && status >= 500) || message.includes('unavailable') || message.includes('abort')) {
    return { state: 'provider_error', reason: 'provider_temporarily_unavailable', providerStatus: status, providerCode };
  }
  if (
    status === 400 || status === 401 || status === 403
    || message.includes('invalid') || message.includes('mismatch')
    || message.includes('missing required scopes') || message.includes('outside authorized')
    || message.includes('permission') || message.includes('token')
  ) {
    return { state: 'action_required', reason: 'authorization_or_permission_invalid', providerStatus: status, providerCode };
  }
  return { state: 'provider_error', reason: 'provider_validation_failed', providerStatus: status, providerCode };
}

export function healthResult(input: Omit<MetaConnectionHealth, 'checkedAt'> & { now?: Date }): MetaConnectionHealth {
  const { now = new Date(), ...rest } = input;
  return { ...rest, checkedAt: now.toISOString() };
}

export function isHealthStale(lastValidatedAt: Date | null, now = new Date(), staleMs = 7 * 24 * 60 * 60_000) {
  return !lastValidatedAt || now.getTime() - lastValidatedAt.getTime() > staleMs;
}
