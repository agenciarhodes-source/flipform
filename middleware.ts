import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJoseSecretsForVerify } from '@/lib/jwt';

const COOKIE = 'flipform_token';

const PROTECTED = ['/dashboard', '/kanban', '/leads', '/forms', '/pipelines', '/reports', '/settings', '/users'];
const ADMIN = ['/admin'];

async function verifyJWT(token: string): Promise<any | null> {
  for (const secret of getJoseSecretsForVerify()) {
    try {
      const { payload } = await jwtVerify(token, secret);
      return payload;
    } catch {
      // try next secret during rotation window
    }
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;

  const isProtectedTenant = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isAdmin = ADMIN.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!isProtectedTenant && !isAdmin) return NextResponse.next();

  if (!token) {
    const url = isAdmin ? '/admin/login' : '/login';
    return NextResponse.redirect(new URL(url, req.url));
  }

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
