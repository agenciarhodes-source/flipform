import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeHostname, isAdminHostname } from '@/lib/host-routing';
import { resolvePublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import { synthesizeReplySpeech } from '@/lib/flip-ai/openai-speech';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COOKIE_NAME = 'flip_ai_session';
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function customDomainHost(request: NextRequest): string | null | undefined {
  const host = normalizeHostname(request.headers.get('host'));
  if (!host) return undefined;
  if (isAdminHostname(host)) return null;
  const appHost = normalizeHostname(process.env.APP_HOSTNAME || process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br');
  if (host === appHost || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return undefined;
  return host;
}

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * Speaks one reply the attendant already wrote in the caller's own conversation.
 * The text never comes from the browser: it is read from the stored message.
 */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const domainHost = customDomainHost(request);
  if (domainHost === null) return refuse(404, 'Not found');

  const sessionToken = request.cookies.get(COOKIE_NAME)?.value || '';
  if (!SESSION_TOKEN.test(sessionToken)) return refuse(401, 'Sessão inválida.');

  const limited = rateLimit({ key: `flip-ai:speech:ip:${getClientIp(request)}`, limit: 40, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) return rateLimitResponse(limited);

  const body = await request.json().catch(() => null) as { messageId?: unknown } | null;
  const messageId = typeof body?.messageId === 'string' ? body.messageId : '';
  if (!UUID.test(messageId)) return refuse(400, 'Mensagem inválida.');

  const runtimeContext = await resolvePublicFlipAiRuntime({
    slug: params.slug,
    ...(domainHost === undefined ? {} : { customDomainHost: domainHost }),
  });
  if (!runtimeContext) return refuse(404, 'Not found');

  // Same identifier the chat gives to the attendant's reply for this session and message.
  const sessionHash = createHash('sha256').update(sessionToken).digest('hex');
  const message = await prisma.message.findFirst({
    where: {
      tenantId: runtimeContext.tenantId,
      provider: 'flip_ai',
      channel: 'web',
      direction: 'outbound',
      externalMessageId: `ai:${sessionHash}:${messageId}`,
    },
    select: { text: true },
  });
  if (!message?.text) return refuse(404, 'Mensagem não encontrada.');

  try {
    const speech = await synthesizeReplySpeech({ text: message.text });
    const body = speech.audio.buffer.slice(
      speech.audio.byteOffset, speech.audio.byteOffset + speech.audio.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(body, {
      headers: { ...NO_STORE, 'Content-Type': speech.contentType, 'Content-Length': String(speech.audio.byteLength) },
    });
  } catch {
    return refuse(502, 'Não foi possível gerar o áudio agora.');
  }
}
