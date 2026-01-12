import { NextRequest, NextResponse } from 'next/server';

const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'yatstats.com';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const url = request.nextUrl.clone();

  // Strip port if present
  const host = hostname.split(':')[0];

  // Only apply subdomain logic on yatstats.com
  const isOnRootDomain =
    host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);

  if (isOnRootDomain) {
    const parts = host.split('.');
    const subdomain = parts.length > 2 ? parts[0] : null;

    // Ignore apex + www
    if (subdomain && subdomain !== 'www') {
      url.pathname = `/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico|_not-found).*)',
};
