import { NextRequest, NextResponse } from 'next/server';
import { normalizeHostname, isAdminHostname } from '@/lib/host-routing';
import { FlipAiError } from '@/lib/flip-ai/access';
import { resolvePublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import { getOrCreatePublicSessionToken } from '@/lib/flip-ai/public-chat';
import { issuePublicRealtimeSession } from '@/lib/flip-ai/realtime-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const COOKIE_NAME = 'flip_ai_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function customDomainHost(request: NextRequest): string | null | undefined {
  const host = normalizeHostname(request.headers.get('host'));
  if (!host) return undefined;
  if (isAdminHostname(host)) return null;
  const appHost = normalizeHostname(
    process.env.APP_HOSTNAME || process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br',
  );
  if (host === appHost || host === 'localhost' || host === '127.0.0.1'
    || host.endsWith('.vercel.app')) return undefined;
  return host;
}

function secureJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
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
    return attachSessionCookie(
      secureJson({ error: error.message, code: error.code }, error.status),
      token,
      created,
    );
  }
  return attachSessionCookie(
    secureJson({
      error: 'A sessão de voz não está disponível agora.',
      code: 'REALTIME_SESSION_UNAVAILABLE',
    }, 503),
    token,
    created,
  );
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const session = getOrCreatePublicSessionToken(request.cookies.get(COOKIE_NAME)?.value);
  const domainHost = customDomainHost(request);
  if (domainHost === null) {
    return attachSessionCookie(secureJson({ error: 'Not found' }, 404), session.token, session.created);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      new FlipAiError('INVALID_REALTIME_SESSION_REQUEST', 400,
        'Revise a solicitação da sessão de voz.'),
      session.token,
      session.created,
    );
  }

  const runtimeContext = await resolvePublicFlipAiRuntime({
    slug: params.slug,
    ...(domainHost === undefined ? {} : { customDomainHost: domainHost }),
  });
  if (!runtimeContext) {
    return attachSessionCookie(secureJson({ error: 'Not found' }, 404), session.token, session.created);
  }

  try {
    const result = await issuePublicRealtimeSession(runtimeContext, session.token, body);
    return attachSessionCookie(secureJson(result), session.token, session.created);
  } catch (error) {
    return jsonError(error, session.token, session.created);
  }
}
