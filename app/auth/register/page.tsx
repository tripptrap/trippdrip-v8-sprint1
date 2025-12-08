'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const [showSuccess, setShowSuccess] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    setLoading(true)

    // Create Supabase client inside the event handler to avoid SSR issues
    const supabase = createClient()

    try {
      // Production domain for email verification
      const baseUrl = 'https://www.hyvewyre.com';

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          // Production domain for email verification
          emailRedirectTo: `${baseUrl}/auth/callback`,
        },
      })

      if (error) {
        // If user already exists, show success message anyway
        // Supabase will send a new verification email
        if (error.message?.includes('already registered')) {
          setShowSuccess(true)
          return
        }
        toast.error(error.message)
        return
      }

      if (data.user) {
        setShowSuccess(true)
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during registration')
    } finally {
      setLoading(false)
    }
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419]">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="max-w-md w-full rounded-2xl shadow-2xl p-8 text-center relative z-10 bg-white/5 border border-white/10 backdrop-blur-sm">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-400 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2 text-white">Check your email!</h2>
            <p className="text-white/60 mb-4">
              We've sent a verification email to <strong className="text-white">{email}</strong>
            </p>
            <p className="text-white/60 text-sm">
              Click the link in the email to verify your account. After verification, you'll be guided through selecting a plan and setting up your account.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start text-left p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <svg className="w-5 h-5 mr-2 flex-shrink-0 text-emerald-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-white/60">
                Check your spam folder if you don't see the email in a few minutes.
              </div>
            </div>

            <div className="flex items-start text-left p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <svg className="w-5 h-5 mr-2 flex-shrink-0 text-emerald-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-white/60">
                After verification, you'll choose your plan and get started!
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Link href="/auth/login" className="text-emerald-400 hover:text-blue-300 font-semibold transition-colors">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419]">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="max-w-md w-full rounded-2xl shadow-2xl p-8 relative z-10 bg-white/5 border border-white/10 backdrop-blur-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-white font-bold text-2xl">HW</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 text-white">HyveWyre™</h1>
          <p className="text-white/60">Create your account</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium mb-2 text-white">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2 text-white">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2 text-white">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-white">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              placeholder="Confirm your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/60">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-emerald-400 hover:text-blue-300 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/preview" className="text-sm text-white/40 hover:text-white/60 transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
