import { NextResponse } from 'next/server';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { sweepUnansweredWhatsAppConversations } from '@/lib/whatsapp-ai/reply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "Quando ninguém responder": the scheduler calls this every minute. */
async function handle(req: Request) {
  if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await sweepUnansweredWhatsAppConversations();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
