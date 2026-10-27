/**
 * Next.js 15 hands route params to handlers as a Promise. The route wrappers (withAuth,
 * withPermission, withPlatformAdmin, withFlipAiSession) resolve it once here, so every handler
 * keeps reading `ctx.params.id` as a plain value.
 */
export async function resolveRouteContext<T>(ctx: T): Promise<T> {
  if (!ctx || typeof ctx !== 'object' || !('params' in ctx)) return ctx;
  const params = await (ctx as { params: unknown }).params;
  return { ...(ctx as object), params } as T;
}
