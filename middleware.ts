import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE = 'flipform_token';
const LEGACY_COOKIE = 'leadflow_token';
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'flipform-dev-secret');

const PROTECTED = ['/dashboard', '/kanban', '/leads', '/forms', '/pipelines', '/reports', '/settings', '/users'];
const ADMIN = ['/admin'];

async function verifyJWT(token: string): Promise<any | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /admin/login é público (sem auth) e tem layout próprio
  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value || req.cookies.get(LEGACY_COOKIE)?.value;

  const isProtectedTenant = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isAdmin = ADMIN.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!isProtectedTenant && !isAdmin) return NextResponse.next();

  if (!token) {
    const url = isAdmin ? '/admin/login' : '/login';
    return NextResponse.redirect(new URL(url, req.url));
  }

  // Para /admin: exige globalRole=platform_admin no JWT
  if (isAdmin) {
    const payload = await verifyJWT(token);
    if (!payload || payload.globalRole !== 'platform_admin') {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*', '/kanban/:path*', '/leads/:path*', '/forms/:path*',
    '/pipelines/:path*', '/reports/:path*', '/settings/:path*', '/users/:path*',
    '/admin/:path*',
  ],
};
