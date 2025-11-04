import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to the login page and API route ONLY
  if (pathname === '/login' || pathname === '/api/auth/login') {
    return NextResponse.next();
  }

  // Check if user has valid auth cookie
  const authCookie = request.cookies.get('site-auth');

  // Check if authenticated
  if (authCookie?.value === 'authenticated') {
    return NextResponse.next();
  }

  // Block everything else and redirect to login
  const url = new URL('/login', request.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match ALL request paths except static files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
