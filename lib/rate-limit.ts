import { NextResponse } from 'next/server';

type RateLimitInput = { key: string; limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; limit: number; remaining: number; resetAt: Date };

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

function nowMs() { return Date.now(); }

export function getClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xReal = req.headers.get('x-real-ip');
  if (xReal) return xReal.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

export function rateLimit(input: RateLimitInput): RateLimitResult {
  const now = nowMs();
  const existing = store.get(input.key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowMs;
    store.set(input.key, { count: 1, resetAt });
    return { allowed: true, limit: input.limit, remaining: Math.max(0, input.limit - 1), resetAt: new Date(resetAt) };
  }

  existing.count += 1;
  store.set(input.key, existing);
  const remaining = Math.max(0, input.limit - existing.count);
  return { allowed: existing.count <= input.limit, limit: input.limit, remaining, resetAt: new Date(existing.resetAt) };
}

export function withRateLimitHeaders(res: NextResponse, result: RateLimitResult) {
  res.headers.set('X-RateLimit-Limit', String(result.limit));
  res.headers.set('X-RateLimit-Remaining', String(result.remaining));
  res.headers.set('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));
  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - nowMs()) / 1000));
  res.headers.set('Retry-After', String(retryAfter));
  return res;
}

export function rateLimitResponse(result: RateLimitResult) {
  const res = NextResponse.json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.', code: 'RATE_LIMITED' }, { status: 429 });
  return withRateLimitHeaders(res, result);
}
