import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJoseSecretsForVerify } from '@/lib/jwt';
import { isAdminHostname } from '@/lib/host-routing';

const COOKIE = 'flipform_token';

const PROTECTED = ['/dashboard', '/kanban', '/leads', '/forms', '/pipelines', '/reports', '/settings', '/users', '/billing'];
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
  const host = req.headers.get('host');
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);

  if (isAdminHostname(host)) {
    const ignore =
      pathname.startsWith('/admin') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/_next') ||
      pathname === '/favicon.ico';

    if (!ignore) {
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = `/admin${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
    }
  }

  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const token = req.cookies.get(COOKIE)?.value;

  const isProtectedTenant = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isAdmin = ADMIN.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!isProtectedTenant && !isAdmin) return NextResponse.next({ request: { headers: requestHeaders } });

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

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
