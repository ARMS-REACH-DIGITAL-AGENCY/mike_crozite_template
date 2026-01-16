import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db'; // Assume your DB helper is here; adjust path

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const host = request.headers.get('host') || '';
  const subdomain = host.split('.')[0]; // e.g., '5004' from 5004.yatstats.com

  if (subdomain && !isNaN(Number(subdomain))) {
    // Check if subdomain matches a staging_url in school_success
    const { rows } = await query<{ hsid: number }>(
      'SELECT hsid FROM school_success WHERE staging_url LIKE $1',
      [`%${subdomain}%`] // Fuzzy match; tighten if needed
    );

    if (rows.length > 0) {
      // Rewrite to dynamic route with hsid
      url.pathname = `/${rows[0].hsid}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // Non-matching: Redirect to main site or default page
  return NextResponse.redirect(new URL('https://yatstats.com', request.url));
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
