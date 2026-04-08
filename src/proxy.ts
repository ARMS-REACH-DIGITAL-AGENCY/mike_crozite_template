// src/proxy.ts
// Injects the current request pathname as an x-pathname request header so that
// server-side layouts (which only receive their own segment params) can
// read the full URL path and extract child-segment params like playerId.
//
// IMPORTANT: Must use NextResponse.next({ request: { headers } }) to forward
// headers to the server component — setting response headers does NOT work.
//
// Note: In Next.js 16, middleware.ts was renamed to proxy.ts and the exported
// function was renamed from `middleware` to `proxy`.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
