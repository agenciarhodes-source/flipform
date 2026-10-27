import { NextRequest, NextResponse } from 'next/server';
import { normalizeHostname, isAdminHostname } from '@/lib/host-routing';
import { resolvePublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import { getOrCreatePublicSessionToken } from '@/lib/flip-ai/public-chat';
import { ChatAttachmentUploadError, issueChatAttachmentUpload } from '@/lib/flip-ai/chat-attachment-upload';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { purgeExpiredChatAttachments } from '@/lib/flip-ai/chat-attachment-library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'flip_ai_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function customDomainHost(request: NextRequest): string | null | undefined {
  const host = normalizeHostname(request.headers.get('host'));
  if (!host) return undefined;
  if (isAdminHostname(host)) return null;
  const appHost = normalizeHostname(process.env.APP_HOSTNAME || process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br');
  if (host === appHost || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return undefined;
  return host;
}

function withSession(response: NextResponse, token: string, created: boolean) {
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

/**
 * Issues a short-lived link so the visitor's browser can send one photo or document straight
 * to private storage. The file is only used after the server checks it, in the messages route.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const session = getOrCreatePublicSessionToken(request.cookies.get(COOKIE_NAME)?.value);
  const domainHost = customDomainHost(request);
  if (domainHost === null) {
    return withSession(NextResponse.json({ error: 'Not found' }, { status: 404 }), session.token, session.created);
  }

  const limited = await rateLimit({ key: `flip-ai:attachment:ip:${getClientIp(request)}`, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) return rateLimitResponse(limited);

  const body = await request.json().catch(() => null) as { name?: unknown; mimeType?: unknown; sizeBytes?: unknown } | null;
  if (!body || typeof body !== 'object') {
    return withSession(NextResponse.json({ error: 'Revise o arquivo enviado.' }, { status: 400, headers: NO_STORE }),
      session.token, session.created);
  }

  const runtimeContext = await resolvePublicFlipAiRuntime({
    slug: params.slug,
    ...(domainHost === undefined ? {} : { customDomainHost: domainHost }),
  });
  if (!runtimeContext) {
    return withSession(NextResponse.json({ error: 'Not found' }, { status: 404 }), session.token, session.created);
  }

  // Every new upload is also the moment a few expired files are cleared, so the 7-day limit
  // does not depend on a scheduler. Best-effort: it never blocks the visitor.
  await purgeExpiredChatAttachments({ limit: 10 }).catch(() => undefined);

  try {
    const upload = await issueChatAttachmentUpload({
      tenantId: runtimeContext.tenantId,
      sessionToken: session.token,
      name: body.name,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    return withSession(NextResponse.json(upload, { headers: NO_STORE }), session.token, session.created);
  } catch (error) {
    const known = error instanceof ChatAttachmentUploadError;
    return withSession(NextResponse.json({
      error: known ? error.message : 'Não foi possível preparar o envio do arquivo.',
      code: known ? error.code : 'CHAT_ATTACHMENT_FAILED',
    }, { status: known ? error.status : 503, headers: NO_STORE }), session.token, session.created);
  }
}
