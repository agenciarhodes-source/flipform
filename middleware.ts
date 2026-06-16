import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { isAdminHostname } from '@/lib/host-routing';

const COOKIE = 'flipform_token';

const PROTECTED = ['/dashboard', '/kanban', '/leads', '/forms', '/pipelines', '/reports', '/settings', '/users', '/billing', '/domains', '/integrations', '/whatsapp-funnel'];
const CUSTOM_DOMAIN_BLOCKED = [...PROTECTED, '/admin', '/login'];
const ADMIN = ['/admin'];

function getJoseSecretsForVerify(): Uint8Array[] {
  const current = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
  const previous = process.env.JWT_SECRET_PREVIOUS;
  if (!current) return [];
  const secrets = previous ? [current, previous] : [current];
  return secrets.map((secret) => new TextEncoder().encode(secret));
}

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

  const normalizedHost = (host || '').split(':')[0].toLowerCase();
  const appDomain = (process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  const isLocalhost = normalizedHost === 'localhost' || normalizedHost === '127.0.0.1';
  const isPlatformHost = !normalizedHost || isLocalhost || normalizedHost === appDomain || normalizedHost.endsWith('.vercel.app');

  if (!isPlatformHost && !isAdminHostname(host)) {
    const ignore = pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname === '/favicon.ico';
    if (!ignore) {
      const blocked = CUSTOM_DOMAIN_BLOCKED.some((p) => pathname === p || pathname.startsWith(p + '/'));
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = blocked || pathname === '/' ? '/custom-domain/__not_found' : `/custom-domain${pathname}`;
      return NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
    }
  }

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
