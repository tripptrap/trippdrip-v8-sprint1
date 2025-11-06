'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
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

        // If no plan selected or on free, redirect to onboarding
        if (!userData || !userData.subscription_tier || userData.subscription_tier === 'free') {
          toast.success('Welcome! Please select your plan.')
          router.push('/auth/onboarding')
        } else {
          toast.success('Successfully logged in!')
          router.push('/leads')
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0b0f14' }}>
      <div className="max-w-md w-full rounded-2xl shadow-xl p-8" style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo-premium.png" alt="HyveWyre™" className="h-24 w-24 rounded-2xl" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#e6e9f0' }}>HyveWyre™</h1>
          <p style={{ color: '#9ca3af' }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
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
              className="w-full px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e6e9f0'
              }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: '#e6e9f0' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e6e9f0'
              }}
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p style={{ color: '#9ca3af' }}>
            Don't have an account?{' '}
            <Link href="/auth/register" className="text-blue-500 hover:text-blue-400 font-semibold">
              Sign up
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/auth/forgot-password" className="text-sm hover:text-blue-400" style={{ color: '#9ca3af' }}>
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  )
}
