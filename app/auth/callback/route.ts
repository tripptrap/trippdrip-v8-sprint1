import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Error exchanging code:', error)
      return NextResponse.redirect(requestUrl.origin + '/auth/login')
    }

    if (data.user) {
      // Check if user has already selected a plan
      const { data: userData } = await supabase
        .from('users')
        .select('subscription_status')
        .eq('id', data.user.id)
        .single()

      // If no plan selected yet (new user) or no subscription, redirect to onboarding
      if (!userData || !userData.subscription_status || userData.subscription_status === 'none') {
        return NextResponse.redirect(requestUrl.origin + '/onboarding')
      }

      // If plan already selected, go to dashboard
      return NextResponse.redirect(requestUrl.origin + '/dashboard')
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(requestUrl.origin + '/auth/login')
}
