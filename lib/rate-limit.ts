import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type RateLimitInput = { key: string; limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; limit: number; remaining: number; resetAt: Date };

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

function nowMs() { return Date.now(); }

/**
 * The client's IP as the host reports it (security protocol S3). FlipForm runs on Vercel, which
 * overwrites x-vercel-forwarded-for, x-real-ip and x-forwarded-for, so a client cannot fake them.
 * cf-connecting-ip is only trusted when the app is put behind Cloudflare (TRUST_CLOUDFLARE_IP=1):
 * otherwise anyone could send it with a different value on each try to escape the limits.
 */
export function getClientIp(req: Request): string {
  if (process.env.TRUST_CLOUDFLARE_IP === '1') {
    const cf = req.headers.get('cf-connecting-ip');
    if (cf) return cf.trim();
  }
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0]?.trim() || 'unknown';
  const xReal = req.headers.get('x-real-ip');
  if (xReal) return xReal.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

/** Limit kept in this server's memory only: the fallback when the database is not reachable. */
export function memoryRateLimit(input: RateLimitInput): RateLimitResult {
  const now = nowMs();
  const existing = store.get(input.key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowMs;
    if (store.size > 10_000) store.clear();
    store.set(input.key, { count: 1, resetAt });
    return { allowed: true, limit: input.limit, remaining: Math.max(0, input.limit - 1), resetAt: new Date(resetAt) };
  }

  existing.count += 1;
  store.set(input.key, existing);
  const remaining = Math.max(0, input.limit - existing.count);
  return { allowed: existing.count <= input.limit, limit: input.limit, remaining, resetAt: new Date(existing.resetAt) };
}

/** Keys carry e-mails and IPs: only a hash goes to the database (LGPD, data minimization). */
export function rateLimitKeyHash(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * How many tries are left (security protocol S3). The count lives in the database, shared by
 * every server of the app, so the limit cannot be escaped by landing on another instance. If the
 * database does not answer, the count falls back to this server's memory instead of blocking.
 */
export async function rateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const keyHash = rateLimitKeyHash(input.key);
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; reset_at: Date }>>(Prisma.sql`
      INSERT INTO rate_limit_buckets (key_hash, count, reset_at, updated_at)
      VALUES (${keyHash}, 1, now() + (${input.windowMs} * interval '1 millisecond'), now())
      ON CONFLICT (key_hash) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.reset_at <= now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
        reset_at = CASE WHEN rate_limit_buckets.reset_at <= now()
          THEN now() + (${input.windowMs} * interval '1 millisecond') ELSE rate_limit_buckets.reset_at END,
        updated_at = now()
      RETURNING count, reset_at
    `);
    const row = rows[0];
    if (!row) return memoryRateLimit(input);
    // Old windows are removed now and then, never on every request.
    if (Math.random() < 0.01) {
      void prisma.$executeRaw(Prisma.sql`DELETE FROM rate_limit_buckets WHERE reset_at < now() - interval '1 hour'`).catch(() => undefined);
    }
    const count = Number(row.count);
    return {
      allowed: count <= input.limit,
      limit: input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt: new Date(row.reset_at),
    };
  } catch {
    return memoryRateLimit(input);
  }
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
