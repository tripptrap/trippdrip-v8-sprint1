import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The access password - change this to whatever you want
const ACCESS_PASSWORD = 'TrippDrip2025$ecure!Preview';

export function middleware(request: NextRequest) {
  // Allow access to the auth page and API routes
  if (request.nextUrl.pathname === '/site-access' ||
      request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Check if user has valid session cookie
  const authCookie = request.cookies.get('site-access-granted');

  if (authCookie?.value === ACCESS_PASSWORD) {
    return NextResponse.next();
  }

  // Redirect to auth page if not authenticated
  return NextResponse.redirect(new URL('/site-access', request.url));
}

// Protect all routes except the auth page itself
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
