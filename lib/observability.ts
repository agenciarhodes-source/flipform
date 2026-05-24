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
