import { NextResponse } from 'next/server';
import { captureServerException } from '@/lib/observability';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { processGoogleConversionOutbox } from '@/lib/tracking/google-funnel-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(req: Request, method: 'GET' | 'POST') {
  try {
    const rl = rateLimit({ key: `job:google-conversions:ip:${getClientIp(req)}`, limit: 10, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);

    if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const summary = await processGoogleConversionOutbox();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    captureServerException(error, { route: '/api/cron/google-conversions', method });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled routes with GET and `Authorization: Bearer <CRON_SECRET>`.
export function GET(req: Request) {
  return run(req, 'GET');
}

export function POST(req: Request) {
  return run(req, 'POST');
}
