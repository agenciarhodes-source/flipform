import { NextResponse } from 'next/server';
import { scheduleAfterResponse } from '@/lib/vercel-wait-until';
import { processZapSignEvent, webhookSecretFor } from '@/lib/contracts/zapsign-signed';
import { zapSignEvent, zapSignWebhookAuthorized } from '@/lib/contracts/zapsign-signed-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * ZapSign warns FlipForm that a document changed. The call must carry the company's secret; the
 * event only says which document, and its state is asked to ZapSign again before anything changes.
 */
export async function POST(req: Request, ctx: { params: { tenantId: string } }) {
  const tenantId = ctx.params.tenantId;
  const secret = /^[A-Za-z0-9_-]{1,64}$/.test(tenantId) ? webhookSecretFor(tenantId) : null;
  if (!secret || !zapSignWebhookAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const event = zapSignEvent(await req.json().catch(() => null));
  if (!event) return NextResponse.json({ ok: true, ignored: true });
  if (!['doc_signed', 'doc_refused'].includes(event.type)) return NextResponse.json({ ok: true, ignored: true });

  const work = processZapSignEvent(tenantId, event.docToken)
    .catch((error) => console.error('ZapSign event failed', { errorType: error instanceof Error ? error.name : 'unknown' }));
  if (!scheduleAfterResponse(work)) await work;
  return NextResponse.json({ ok: true });
}
