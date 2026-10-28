import { NextResponse } from 'next/server';
import { isCronRequestAuthorized } from '@/lib/cron-auth';
import { sweepUnansweredWhatsAppConversations } from '@/lib/whatsapp-ai/reply';
import { sweepWhatsAppReactivations } from '@/lib/whatsapp-ai/reactivation';
import { sweepDailyAiReviews } from '@/lib/whatsapp-ai/reviews';
import { sweepWhatsAppWelcomes } from '@/lib/whatsapp-ai/welcome';
import { sweepUnansweredInstagramConversations } from '@/lib/instagram-ai/reply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "Quando ninguém responder", "Mensagem de reativação" and the daily AI review: called every minute. */
async function handle(req: Request) {
  if (!isCronRequestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await sweepUnansweredWhatsAppConversations();
  const reactivation = await sweepWhatsAppReactivations().catch(() => ({ numbers: 0, sent: 0, failed: true }));
  const welcome = await sweepWhatsAppWelcomes().catch(() => ({ companies: 0, sent: 0, failed: true }));
  const reviews = await sweepDailyAiReviews().catch(() => ({ tenants: 0, reviewed: 0, failed: true }));
  const instagram = await sweepUnansweredInstagramConversations().catch(() => ({ companies: 0, replied: 0, failed: true }));
  return NextResponse.json({ ok: true, ...result, reactivation, welcome, reviews, instagram });
}

export const GET = handle;
export const POST = handle;
