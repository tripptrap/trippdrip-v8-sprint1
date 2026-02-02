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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/auth/reset-password`,
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">Check your email</h2>
            <p className="text-gray-600">
              We've sent a password reset link to <strong className="text-gray-900">{email}</strong>
            </p>
          </div>

          <Link
            href="/auth/login"
            className="inline-block text-teal-600 hover:text-teal-700 font-semibold transition-colors"
          >
            Back to login
          </Link>
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
          <h1 className="text-3xl font-bold mb-2 text-gray-900">Reset Password</h1>
          <p className="text-gray-600">Enter your email to receive a reset link</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white py-3 rounded-lg font-semibold hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-teal-500/20"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
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
