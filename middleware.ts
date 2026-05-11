import { NextResponse, NextRequest } from 'next/server';

const COOKIE = 'leadflow_token';
const PROTECTED = ['/dashboard', '/kanban', '/leads', '/forms', '/pipelines', '/reports', '/settings', '/users'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/kanban/:path*', '/leads/:path*', '/forms/:path*', '/pipelines/:path*', '/reports/:path*', '/settings/:path*', '/users/:path*'],
};
