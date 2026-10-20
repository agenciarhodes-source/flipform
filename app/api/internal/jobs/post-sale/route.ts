import { NextResponse } from 'next/server';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { runPostSaleMessages } from '@/lib/post-sale/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** After-sale messages: the scheduler calls this every hour. */
async function handle(req: Request) {
  if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await runPostSaleMessages();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
