import * as Sentry from '@sentry/nextjs';

type Ctx = {
  route: string;
  method?: string;
  tenantId?: string | null;
  tenantSlug?: string | null;
  userId?: string | null;
  role?: string | null;
  requestId?: string | null;
};

export function captureServerException(error: unknown, ctx: Ctx) {
  Sentry.withScope((scope) => {
    scope.setTag('route', ctx.route);
    if (ctx.method) scope.setTag('method', ctx.method);
    if (ctx.tenantId) scope.setTag('tenantId', ctx.tenantId);
    if (ctx.tenantSlug) scope.setTag('tenantSlug', ctx.tenantSlug);
    if (ctx.userId) scope.setUser({ id: ctx.userId });
    if (ctx.role) scope.setTag('role', ctx.role);
    if (ctx.requestId) scope.setTag('requestId', ctx.requestId);
    Sentry.captureException(error);
  });
}

const SENSITIVE_KEYS = [
  'password', 'senha', 'token', 'secret', 'authorization', 'cookie', 'set-cookie',
  'apikey', 'api_key', 'asaas_api_key', 'asaas_webhook_token', 'smtp_password',
  'resend_api_key', 'database_url', 'jwt_secret_current', 'jwt_secret_previous', 'firstaccesstoken',
];

export function redactSensitiveData<T = unknown>(input: T): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((v) => redactSensitiveData(v)) as T;
  if (typeof input !== 'object') return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const normalized = k.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => normalized.includes(s))) out[k] = '[REDACTED]';
    else out[k] = redactSensitiveData(v);
  }
  return out as T;
}

export function captureRouteError(error: unknown, ctx: Ctx & { metadata?: Record<string, unknown> }) {
  captureServerException(error, ctx);
  if (ctx.metadata) {
    // structured and redacted local fallback for environments without Sentry
    console.error('[route.error]', redactSensitiveData({ ...ctx, metadata: ctx.metadata, message: error instanceof Error ? error.message : String(error) }));
  }
}
