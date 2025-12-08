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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Create Supabase client inside the event handler to avoid SSR issues
    const supabase = createClient()

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
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419]">
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
            <div className="h-20 w-20 bg-gradient-to-br from-emerald-400 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">HW</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 text-white">HyveWyre™</h1>
          <p className="text-white/60">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
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
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/60">
            Don't have an account?{' '}
            <Link href="/auth/register" className="text-emerald-400 hover:text-blue-300 font-semibold transition-colors">
              Sign up
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/auth/forgot-password" className="text-sm text-white/60 hover:text-emerald-400 transition-colors">
            Forgot your password?
          </Link>
        </div>

        <div className="mt-6 text-center">
          <Link href="/preview" className="text-sm text-white/40 hover:text-white/60 transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
