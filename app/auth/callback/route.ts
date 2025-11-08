import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const response = NextResponse.next()
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
            response.cookies.set({
              name,
              value,
              ...options,
              httpOnly: false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            })
          },
          remove(name: string, options: any) {
            response.cookies.set({
              name,
              value: '',
              ...options,
              maxAge: 0,
            })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Error exchanging code:', error)
      return NextResponse.redirect(requestUrl.origin + '/auth/login')
    }

    if (data.user && data.session) {
      // Session is now established
      // Check if user has already selected a plan
      const { data: userData } = await supabase
        .from('users')
        .select('subscription_tier')
        .eq('id', data.user.id)
        .single()

      // Create response with proper redirect
      const redirectUrl = (!userData || !userData.subscription_tier)
        ? requestUrl.origin + '/auth/onboarding'
        : requestUrl.origin + '/leads'

      const redirectResponse = NextResponse.redirect(redirectUrl)

      // Copy cookies from response to redirectResponse
      response.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie)
      })

      return redirectResponse
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(requestUrl.origin + '/auth/login')
}
