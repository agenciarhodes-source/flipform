import { NextRequest } from 'next/server';
import { getPlatformWhatsAppWebhookCredentials, getWhatsAppWebhookVerifyToken } from '@/lib/meta/whatsapp-runtime-credentials';
import { processWhatsAppCloudWebhook, verifyWhatsAppWebhookChallenge, verifyWhatsAppWebhookSignature } from '@/lib/meta/whatsapp-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Meta WhatsApp webhook processing failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return new Response('Webhook processing failed', { status: 500 });
  }
}
