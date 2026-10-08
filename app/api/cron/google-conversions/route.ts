import { NextResponse } from 'next/server';
import { captureServerException } from '@/lib/observability';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { processGoogleConversionOutbox } from '@/lib/tracking/google-funnel-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const rl = rateLimit({ key: `job:google-conversions:ip:${getClientIp(req)}`, limit: 10, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);

    if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const summary = await processGoogleConversionOutbox();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    captureServerException(error, { route: '/api/cron/google-conversions', method: 'POST' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
