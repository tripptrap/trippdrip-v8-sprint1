'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface AccountStatusInfo {
  status: string;
  reason: string | null;
  suspended_until: string | null;
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [accountStatus, setAccountStatus] = useState<AccountStatusInfo | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setAccountStatus(null)

    // Create Supabase client inside the event handler to avoid SSR issues
    const supabase = createClient()

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // Check if user is banned/suspended — Supabase may return generic errors for banned users
        try {
          const statusRes = await fetch('/api/auth/account-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          })
          const statusData = await statusRes.json()
          if (statusData.status === 'banned' || statusData.status === 'suspended') {
            setAccountStatus(statusData)
            return
          }
        } catch {
          // Fall through to generic error
        }
        toast.error(error.message)
        return
      }

      if (data.user) {
        // Check if user has selected a plan
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('subscription_tier')
          .eq('id', data.user.id)
          .single()

        if (userError && userError.code !== 'PGRST116') {
          console.error('Error checking user plan:', userError)
        }

        // If no plan selected or unpaid, redirect to onboarding
        if (!userData || !userData.subscription_tier || userData.subscription_tier === 'unpaid') {
          toast.success('Welcome! Please select your plan.')
          router.push('/auth/onboarding')
        } else {
          toast.success('Successfully logged in!')
          router.push('/dashboard')
        }
        router.refresh()
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5]">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, #14b8a6 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="max-w-md w-full rounded-2xl shadow-xl p-8 relative z-10 bg-white border border-gray-200">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">HW</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 text-gray-900">HyveWyre™</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        {accountStatus && (
          <div className="mb-6 p-4 rounded-xl border-2 border-red-300 bg-red-50">
            <h3 className="text-lg font-bold text-red-700 mb-2">
              {accountStatus.status === 'banned' ? 'Account Banned' : 'Account Suspended'}
            </h3>
            {accountStatus.reason && (
              <div className="mb-3">
                <p className="text-sm font-medium text-red-600">Reason:</p>
                <p className="text-sm text-red-700">{accountStatus.reason}</p>
              </div>
            )}
            {accountStatus.status === 'suspended' && accountStatus.suspended_until ? (
              <p className="text-sm text-red-600">
                Access will be restored on{' '}
                <strong>
                  {new Date(accountStatus.suspended_until).toLocaleString('en-US', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </strong>
              </p>
            ) : accountStatus.status === 'banned' ? (
              <p className="text-sm text-red-600">
                This ban is permanent. Contact support to appeal.
              </p>
            ) : (
              <p className="text-sm text-red-600">
                Your account is suspended indefinitely. Contact support to appeal.
              </p>
            )}
            <p className="text-xs text-red-500 mt-3">
              Need help?{' '}
              <a href="mailto:support@hyvewyre.com" className="underline font-medium">
                support@hyvewyre.com
              </a>
            </p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2 text-gray-700">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2 text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-500/20"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Don't have an account?{' '}
            <Link href="/auth/register" className="text-teal-600 hover:text-teal-700 font-semibold transition-colors">
              Sign up
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/auth/forgot-password" className="text-sm text-gray-500 hover:text-teal-600 transition-colors">
            Forgot your password?
          </Link>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
