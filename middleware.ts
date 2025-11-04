import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if user has valid auth cookie
  const authCookie = request.cookies.get('site-auth');

  // Allow access to the login page and API route
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/api/auth/login') {
    return NextResponse.next();
  }

  // Check if authenticated
  if (authCookie?.value === 'authenticated') {
    return NextResponse.next();
  }

  // Redirect to login page
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
