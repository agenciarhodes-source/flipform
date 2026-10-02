import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { captureServerException } from '@/lib/observability';
import { getStripeTestClient } from '@/lib/stripe/client';
import { requireStripeWebhookSecret, StripeFoundationConfigError } from '@/lib/stripe/config';
import {
  applyVerifiedStripeTopUpPayment,
  retrieveVerifiedStripeTopUpPayment,
  StripeTopUpWebhookError,
} from '@/lib/stripe/top-up-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_BYTES = 1_000_000;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `webhook:stripe:ip:${ip}`, limit: 240, windowMs: 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  let webhookSecret: string;
  try {
    webhookSecret = requireStripeWebhookSecret();
  } catch (error) {
    const code = error instanceof StripeFoundationConfigError ? error.code : 'STRIPE_WEBHOOK_NOT_READY';
    return NextResponse.json({ error: 'webhook_not_configured', code }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const rawBody = await req.text();
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 413 });
  }

  let event: Stripe.Event;
  try {
    event = getStripeTestClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    const verified = await retrieveVerifiedStripeTopUpPayment(event);
    if (!verified) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const result = await applyVerifiedStripeTopUpPayment(verified);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof StripeTopUpWebhookError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    captureServerException(error, { route: '/api/webhooks/stripe', method: 'POST' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
