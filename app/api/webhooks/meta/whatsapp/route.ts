import { NextRequest } from 'next/server';
import { runAutomationWorker } from '@/lib/automation';
import { getPlatformWhatsAppWebhookCredentials, getWhatsAppWebhookVerifyToken } from '@/lib/meta/whatsapp-runtime-credentials';
import { processWhatsAppCloudWebhook, verifyWhatsAppWebhookChallenge, verifyWhatsAppWebhookSignature } from '@/lib/meta/whatsapp-runtime';
import { scheduleAfterResponse } from '@/lib/vercel-wait-until';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const verifyToken = getWhatsAppWebhookVerifyToken();
  if (!verifyToken) return new Response('Webhook not configured', { status: 503 });

  const url = new URL(req.url);
  const valid = verifyWhatsAppWebhookChallenge({
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
  const credentials = await getPlatformWhatsAppWebhookCredentials();
  if (!credentials) return new Response('Webhook not configured', { status: 503 });

  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyWhatsAppWebhookSignature(rawBody, signature, credentials.appSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  try {
    const result = await processWhatsAppCloudWebhook(payload);
    console.info('Meta WhatsApp webhook processed', result);

    if (result.automationsQueued > 0) {
      const backgroundWork = runAutomationWorker()
        .then(workerResult => {
          if (workerResult.claimed > 0 || workerResult.errors > 0) {
            console.info('WhatsApp automation core worker processed', workerResult);
          }
        })
        .catch(error => {
          // Queue rows are durable and are also reclaimed by the central worker.
          console.error('WhatsApp automation core background worker failed', {
            errorType: error instanceof Error ? error.name : 'unknown',
          });
        });

      if (!scheduleAfterResponse(backgroundWork)) {
        await backgroundWork;
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Meta WhatsApp webhook processing failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return new Response('Webhook processing failed', { status: 500 });
  }
}
