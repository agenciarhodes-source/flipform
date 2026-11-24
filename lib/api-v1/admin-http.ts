import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { apiV1Enabled } from './policy';
import { mayManageApiV1Credentials } from './prisma-credential-repository';

export type ApiV1AdminActor = { userId: string; tenantId: string };
const MAX_JSON_BYTES = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validApiV1Uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
export function adminV1Response(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: {
    'Cache-Control': 'no-store, private', 'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  } });
}
export function adminV1Error(status: 400 | 401 | 403 | 404 | 409 | 429 | 503): NextResponse {
  return adminV1Response({ code: status === 404 ? 'api_unavailable'
    : status === 400 ? 'invalid_request'
    : status === 401 ? 'invalid_credential'
    : status === 429 ? 'rate_limited'
    : status === 409 ? 'conflict'
    : status === 503 ? 'dependency_unavailable'
    : 'permission_denied' }, status);
}

/**
 * Cookie-backed API key administration requires a browser same-origin request.
 * No CORS opt-in and no mutation using an M2M bearer. This is separate from
 * the normal JWT/DB session verification performed by withAuth().
 */
export function isApiV1SameOriginMutation(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin || origin.length > 220) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  try {
    const expected = new URL(req.url);
    const observed = new URL(origin);
    return observed.origin === expected.origin
      && observed.username === '' && observed.password === ''
      && !observed.search && !observed.hash
      && (observed.protocol === 'https:' || (observed.protocol === 'http:' && process.env.NODE_ENV !== 'production'));
  } catch { return false; }
}

/** Bounded JSON read, before validation; no arbitrary-size credential payload. */
export async function readApiV1Json(req: NextRequest): Promise<Record<string, unknown> | null> {
  if (!isApiV1SameOriginMutation(req)
    || !req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const length = Number(req.headers.get('content-length') || '0');
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_JSON_BYTES || !req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(next.value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch { return null; }
}

/** The supplied actor is from a verified session, never from JSON. */
export async function verifyApiV1Owner(actor: ApiV1AdminActor, verifiedSessionRole: string): Promise<boolean> {
  return verifiedSessionRole === 'developer' && apiV1Enabled(process.env) && Boolean(actor.userId && actor.tenantId)
    && mayManageApiV1Credentials(actor, actor.tenantId);
}
