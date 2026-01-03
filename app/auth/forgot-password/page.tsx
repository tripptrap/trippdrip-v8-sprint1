'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Create Supabase client inside the event handler to avoid SSR issues
    const supabase = createClient()

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        toast.error(error.message)
        return
      }

      setSent(true)
      toast.success('Password reset email sent! Check your inbox.')
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0b0f14' }}>
        <div className="max-w-md w-full rounded-2xl shadow-xl p-8 text-center" style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-emerald-600 bg-opacity-20 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#e6e9f0' }}>Check your email</h2>
            <p style={{ color: '#9ca3af' }}>
              We've sent a password reset link to <strong style={{ color: '#e6e9f0' }}>{email}</strong>
            </p>
          </div>

          <Link
            href="/auth/login"
            className="inline-block text-emerald-500 hover:text-teal-600 font-semibold"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0b0f14' }}>
      <div className="max-w-md w-full rounded-2xl shadow-xl p-8" style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#e6e9f0' }}>Reset Password</h1>
          <p style={{ color: '#9ca3af' }}>Enter your email to receive a reset link</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#e6e9f0' }}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e6e9f0'
              }}
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-gray-900 py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/auth/login" className="text-emerald-500 hover:text-teal-600 font-semibold">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
