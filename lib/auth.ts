import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { signSessionToken, verifySessionToken, type JwtSessionPayload } from './jwt';

const COOKIE_NAME = 'flipform_token';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days


function isSecureRequest(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  const forwardedProto = process.env.TRUST_PROXY_PROTO;
  if (forwardedProto && forwardedProto.toLowerCase() === 'https') return true;
  return false;
}

function getSameSite(): 'lax' | 'strict' | 'none' {
  const raw = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (raw === 'strict' || raw === 'none') return raw;
  return 'lax';
}

export interface SessionPayload extends JwtSessionPayload {
  userId: string;
  // tenantId é '' apenas para sessões de platform admin sem tenant
  tenantId: string;
  role: string;
  email: string;
  name: string;
  tenantSlug: string;
  globalRole?: string | null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: SessionPayload): string {
  return signSessionToken(payload);
}

export function verifyToken(token: string): SessionPayload | null {
  return verifySessionToken(token);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = signToken(payload);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: getSameSite(),
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: getSameSite(),
    path: '/',
    maxAge: 0,
  });
}

function readCookieToken(): string | undefined {
  const c = cookies();
  return c.get(COOKIE_NAME)?.value;
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = readCookieToken();
  if (!token) return null;
  return verifyToken(token);
}

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}

/**
 * Tenant statuses que BLOQUEIAM acesso à aplicação.
 */
const BLOCKED_STATUSES = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

/**
 * Wraps an API handler. Verifies session and injects it.
 * All private endpoints MUST use this to ensure tenant isolation.
 *
 * Bloqueia tenant com status em BLOCKED_STATUSES (403 com error code).
 * Platform admins sem tenantId não são afetados.
 */
export function withAuth<T = any>(
  handler: (req: NextRequest, session: SessionPayload, ctx: T) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest, ctx: T) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Tenant gating (apenas se a sessão tem tenantId)
    if (session.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { status: true },
      });
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 401 });
      }
      if (BLOCKED_STATUSES.has(String(tenant.status))) {
        return NextResponse.json(
          { error: 'Acesso bloqueado. Entre em contato com o administrador.', code: 'tenant_blocked', status: tenant.status },
          { status: 403 },
        );
      }
    }
    return handler(req, session, ctx);
  };
}

/**
 * Para rotas administrativas da plataforma (/admin/* APIs).
 * Requer usuário com globalRole === 'platform_admin'.
 */
export function withPlatformAdmin<T = any>(
  handler: (req: NextRequest, session: SessionPayload, ctx: T) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest, ctx: T) => {
    const session = getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.globalRole !== 'platform_admin') {
      return NextResponse.json({ error: 'Acesso restrito ao Super Admin da plataforma.' }, { status: 403 });
    }
    return handler(req, session, ctx);
  };
}

export async function loadUserSession(userId: string, tenantId: string): Promise<SessionPayload | null> {
  const tu = await prisma.tenantUser.findFirst({
    where: { userId, tenantId, status: 'active' },
    include: { user: true, tenant: true },
  });
  if (!tu) return null;
  return {
    userId: tu.userId,
    tenantId: tu.tenantId,
    role: tu.role,
    email: tu.user.email,
    name: tu.user.name,
    tenantSlug: tu.tenant.slug,
    globalRole: tu.user.globalRole || null,
  };
}
