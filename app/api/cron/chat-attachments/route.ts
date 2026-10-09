import { NextResponse } from 'next/server';
import { captureServerException } from '@/lib/observability';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { purgeExpiredChatAttachments } from '@/lib/flip-ai/chat-attachment-storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Deletes chat files whose retention ended. Expired files are also cleared on every new upload. */
async function run(req: Request, method: 'GET' | 'POST') {
  try {
    const rl = rateLimit({ key: `job:chat-attachments:ip:${getClientIp(req)}`, limit: 10, windowMs: 60 * 1000 });
    if (!rl.allowed) return rateLimitResponse(rl);

    if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const summary = await purgeExpiredChatAttachments();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    captureServerException(error, { route: '/api/cron/chat-attachments', method });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export function GET(req: Request) {
  return run(req, 'GET');
}

export function POST(req: Request) {
  return run(req, 'POST');
}
