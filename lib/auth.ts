import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'leadflow-dev-secret';
const COOKIE_NAME = 'leadflow_token';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
  tenantSlug: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = signToken(payload);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
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
 * Wraps an API handler. Verifies session and injects it.
 * All private endpoints MUST use this to ensure tenant isolation.
 */
export function withAuth<T = any>(
  handler: (req: NextRequest, session: SessionPayload, ctx: T) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest, ctx: T) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  };
}
