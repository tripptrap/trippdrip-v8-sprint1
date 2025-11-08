import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createClient } from '@/lib/supabase/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Update Supabase session
  const response = await updateSession(request)

  // Public routes that don't require authentication
  const publicRoutes = [
    '/auth/login',
    '/auth/register',
    '/auth/callback',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/onboarding',
    '/api/auth',
    '/api/stripe/webhook',
    '/preview',
    '/privacy',
    '/terms',
    '/compliance',
    '/refund',
  ]

  // Check if the current path is public
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  if (isPublicRoute) {
    return response
  }

  // Check if user is authenticated via Supabase
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Redirect to login if not authenticated
    const url = new URL('/auth/login', request.url)
    return NextResponse.redirect(url)
  }

  // If user is authenticated, check if they have selected a plan
  // Skip this check if they're already on the onboarding page
  if (pathname !== '/auth/onboarding') {
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', user.id)
      .single()

    // If no plan selected or on preview, redirect to onboarding
    if (!userData || !userData.subscription_tier || userData.subscription_tier === 'preview') {
      const url = new URL('/auth/onboarding', request.url)
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
