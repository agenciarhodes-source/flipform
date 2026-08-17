import { NextRequest } from 'next/server';
import {
  getInstagramWebhookVerifyToken,
  getPlatformInstagramWebhookCredentials,
} from '@/lib/meta/instagram-runtime-credentials';
import {
  processInstagramWebhook,
  verifyInstagramWebhookChallenge,
  verifyInstagramWebhookSignature,
} from '@/lib/meta/instagram-webhook-runtime';
import { drainInstagramCommentAutomationQueue } from '@/lib/meta/instagram-comment-automation';
import { scheduleAfterResponse } from '@/lib/vercel-wait-until';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const verifyToken = getInstagramWebhookVerifyToken();
  if (!verifyToken) return new Response('Webhook not configured', { status: 503 });

  const url = new URL(req.url);
  const valid = verifyInstagramWebhookChallenge({
    mode: url.searchParams.get('hub.mode'),
    verifyToken: url.searchParams.get('hub.verify_token'),
    challenge: url.searchParams.get('hub.challenge'),
    configuredVerifyToken: verifyToken,
  });

  if (!valid) return new Response('Forbidden', { status: 403 });
  return new Response(url.searchParams.get('hub.challenge') || '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(req: NextRequest) {
  const credentials = await getPlatformInstagramWebhookCredentials();
  if (!credentials) return new Response('Webhook not configured', { status: 503 });

  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyInstagramWebhookSignature(rawBody, signature, credentials.appSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  try {
    const result = await processInstagramWebhook(payload);
    console.info('Meta Instagram webhook processed', result);

    const backgroundWork = drainInstagramCommentAutomationQueue()
      .then(workerResult => {
        if (workerResult.claimed > 0 || workerResult.errors > 0) {
          console.info('Instagram comment automation worker processed', workerResult);
        }
      })
      .catch(error => {
        // Queue rows remain durable and can be reclaimed by a later signed webhook.
        console.error('Instagram comment automation background worker failed', {
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      });

    if (!scheduleAfterResponse(backgroundWork)) {
      await backgroundWork;
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Meta Instagram webhook processing failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return new Response('Webhook processing failed', { status: 500 });
  }
}
