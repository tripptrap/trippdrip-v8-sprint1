'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // Supabase automatically exchanges the recovery token from the URL hash
    // and establishes a session. We listen for that event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if we already have a session (user may have landed here with a valid session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setError(error.message)
        toast.error(error.message)
        return
      }

      setSuccess(true)
      toast.success('Password updated successfully!')
      setTimeout(() => {
        router.push('/auth/login')
      }, 3000)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      toast.error(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5]">
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, #14b8a6 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="max-w-md w-full rounded-2xl shadow-xl p-8 text-center relative z-10 bg-white border border-gray-200">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-teal-500/20">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Password Updated</h2>
            <p className="text-gray-600">
              Your password has been reset successfully. Redirecting to login...
            </p>
          </div>

          <Link
            href="/auth/login"
            className="inline-block text-teal-600 hover:text-teal-700 font-semibold transition-colors"
          >
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5]">
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, #14b8a6 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="max-w-md w-full rounded-2xl shadow-xl p-8 text-center relative z-10 bg-white border border-gray-200">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-teal-500/20">
              <span className="text-white font-bold text-2xl">HW</span>
            </div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Verifying Link...</h2>
            <p className="text-gray-600">
              Please wait while we verify your reset link.
            </p>
          </div>

          <p className="text-sm text-gray-500 mt-4">
            If this takes too long, your link may have expired.{' '}
            <Link href="/auth/forgot-password" className="text-teal-600 hover:text-teal-700 font-semibold">
              Request a new one
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5]">
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, #14b8a6 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="max-w-md w-full rounded-2xl shadow-xl p-8 relative z-10 bg-white border border-gray-200">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/20">
              <span className="text-white font-bold text-2xl">HW</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 text-gray-900">Set New Password</h1>
          <p className="text-gray-600">Enter your new password below</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2 text-gray-700">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-gray-700">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              placeholder="Confirm your password"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-lg font-semibold hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-teal-500/20"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/auth/login" className="text-teal-600 hover:text-teal-700 font-semibold transition-colors">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
