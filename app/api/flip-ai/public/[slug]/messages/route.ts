import { NextRequest, NextResponse } from 'next/server';
import { normalizeHostname, isAdminHostname } from '@/lib/host-routing';
import { FlipAiError } from '@/lib/flip-ai/access';
import { resolvePublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import {
  buildPublicChatContext,
  completePublicChatTurn,
  failPublicChatTurn,
  getOrCreatePublicSessionToken,
  preparePublicChatTurn,
} from '@/lib/flip-ai/public-chat';
import { OpenAiResponseError, streamOpenAiText } from '@/lib/flip-ai/openai-responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COOKIE_NAME = 'flip_ai_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function customDomainHost(request: NextRequest): string | null | undefined {
  const host = normalizeHostname(request.headers.get('host'));
  if (!host) return undefined;
  if (isAdminHostname(host)) return null;
  const appHost = normalizeHostname(process.env.APP_HOSTNAME || process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br');
  if (host === appHost || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return undefined;
  return host;
}

function attachSessionCookie(response: NextResponse, token: string, created: boolean) {
  if (created) {
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
  }
  return response;
}

function jsonError(error: unknown, token: string, created: boolean) {
  if (error instanceof FlipAiError) {
    return attachSessionCookie(NextResponse.json({ error: error.message, code: error.code }, { status: error.status }), token, created);
  }
  return attachSessionCookie(NextResponse.json({
    error: 'Não foi possível processar a mensagem agora.',
    code: 'PUBLIC_CHAT_UNAVAILABLE',
  }, { status: 503 }), token, created);
}

function sseData(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const session = getOrCreatePublicSessionToken(request.cookies.get(COOKIE_NAME)?.value);
  const domainHost = customDomainHost(request);
  if (domainHost === null) {
    return attachSessionCookie(NextResponse.json({ error: 'Not found' }, { status: 404 }), session.token, session.created);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(new FlipAiError('INVALID_PUBLIC_CHAT_MESSAGE', 400, 'Revise a mensagem enviada.'),
      session.token, session.created);
  }

  const runtimeContext = await resolvePublicFlipAiRuntime({
    slug: params.slug,
    ...(domainHost === undefined ? {} : { customDomainHost: domainHost }),
  });
  if (!runtimeContext) {
    return attachSessionCookie(NextResponse.json({ error: 'Not found' }, { status: 404 }), session.token, session.created);
  }

  let turn: Awaited<ReturnType<typeof preparePublicChatTurn>>;
  try {
    turn = await preparePublicChatTurn(runtimeContext, session.token, body);
  } catch (error) {
    return jsonError(error, session.token, session.created);
  }

  const encoder = new TextEncoder();
  if (turn.mode === 'replay') {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseData('delta', { delta: turn.text })));
        controller.enqueue(encoder.encode(sseData('done', { messageId: turn.messageId, replayed: true })));
        controller.close();
      },
    });
    return attachSessionCookie(new NextResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
    }), session.token, session.created);
  }

  let context;
  try {
    context = await buildPublicChatContext(runtimeContext, turn);
  } catch (error) {
    return jsonError(error, session.token, session.created);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await streamOpenAiText(context, (delta) => {
          controller.enqueue(encoder.encode(sseData('delta', { delta })));
        });
        await completePublicChatTurn(turn, result);
        controller.enqueue(encoder.encode(sseData('done', {
          messageId: turn.messageId,
          responseId: result.responseId,
          replayed: false,
        })));
      } catch (error) {
        const failure = error instanceof OpenAiResponseError
          ? error : new OpenAiResponseError('ambiguous', 'PUBLIC_CHAT_RESULT_AMBIGUOUS');
        try {
          await failPublicChatTurn(turn, failure, 'response');
        } catch {
          // The visible error remains ambiguous; no automatic retry is attempted.
        }
        controller.enqueue(encoder.encode(sseData('error', {
          code: failure.code,
          retryRequiresConfirmation: true,
          message: failure.kind === 'ambiguous'
            ? 'A resposta ficou incerta. Confirme antes de tentar novamente.'
            : 'Não foi possível responder agora. Confirme uma nova tentativa.',
        })));
      } finally {
        controller.close();
      }
    },
  });

  return attachSessionCookie(new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    },
  }), session.token, session.created);
}
