import { NextRequest } from 'next/server';
import { runAutomationWorker } from '@/lib/automation';
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

    const coreWork = runAutomationWorker()
      .then(workerResult => {
        if (workerResult.claimed > 0 || workerResult.errors > 0) {
          console.info('Instagram automation core worker processed', workerResult);
        }
      })
      .catch(error => {
        // Core queue rows remain durable and are also reclaimed by the central scheduled worker.
        console.error('Instagram automation core background worker failed', {
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      });

    const legacyDrainWork = drainInstagramCommentAutomationQueue()
      .then(workerResult => {
        if (workerResult.claimed > 0 || workerResult.errors > 0) {
          console.info('Instagram legacy automation drain processed', workerResult);
        }
      })
      .catch(error => {
        // Legacy rows are only drained for jobs queued before the core cutover.
        console.error('Instagram legacy automation drain failed', {
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      });

    const backgroundWork = Promise.all([coreWork, legacyDrainWork]).then(() => undefined);

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
