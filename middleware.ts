import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  // Example: hamilton.yatstats.com → "hamilton"
  const subdomain = host.split(".")[0];

  // Attach derived context as headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-school-slug", subdomain);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
