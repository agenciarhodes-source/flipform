import { NextResponse } from 'next/server';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { sweepUnansweredWhatsAppConversations } from '@/lib/whatsapp-ai/reply';
import { sweepWhatsAppReactivations } from '@/lib/whatsapp-ai/reactivation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "Quando ninguém responder" and "Mensagem de reativação": the scheduler calls this every minute. */
async function handle(req: Request) {
  if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await sweepUnansweredWhatsAppConversations();
  const reactivation = await sweepWhatsAppReactivations().catch(() => ({ numbers: 0, sent: 0, failed: true }));
  return NextResponse.json({ ok: true, ...result, reactivation });
}

export const GET = handle;
export const POST = handle;
