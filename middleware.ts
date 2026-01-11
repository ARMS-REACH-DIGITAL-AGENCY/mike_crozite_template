import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware to map subdomains to dynamic routes.
 *
 * When a request arrives on a subdomain such as `5004.example.com`, Next.js
 * normally interprets the request path relative to the root of the app.
 * However, in this project each subdomain corresponds to a unique high school
 * identifier (HSID) and should be treated as the first segment of the URL.
 * This middleware extracts the subdomain from the Host header and rewrites
 * the request URL so that dynamic routes under `src/app/[hsid]` are matched.
 *
 * Requests to the primary domain (e.g. `yatstats.com` or `www.yatstats.com`)
 * are passed through unchanged so that the generic homepage still renders.
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const url = request.nextUrl.clone();

  // Determine if we are in development mode.
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Split the hostname into parts (subdomain.first-level-domain.top-level-domain).
  const parts = hostname.split('.');

  // Hostnames with at least three parts indicate a subdomain (e.g. 5004.example.com).
  if (!isDevelopment && parts.length >= 3) {
    const subdomain = parts[0];

    // Ignore the 'www' subdomain so that the root site still works.
    if (subdomain !== 'www') {
      // Prepend the subdomain to the pathname. For example, a request to
      // `5004.example.com/players` becomes `/5004/players`, allowing Next.js
      // to match `src/app/[hsid]/page.tsx` and deeper routes.
      url.pathname = `/${subdomain}${url.pathname}`;

      // IMPORTANT: Do not change hostname/protocol; only rewrite the pathname.
      return NextResponse.rewrite(url);
    }
  }

  // For all other cases (root domain, development, etc.) continue as normal.
  return NextResponse.next();
}

export const config = {
  // Exclude API routes, Next.js static files and the favicon from rewriting.
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};