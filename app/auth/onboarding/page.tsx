'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function OnboardingPage() {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'premium' | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSelectPlan = async () => {
    if (!selectedPlan) {
      toast.error('Please select a plan')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Not authenticated')
        router.push('/auth/login')
        return
      }

      // Create Stripe checkout session for subscription
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionType: selectedPlan
        })
      })

      const result = await response.json()

      if (result.setup) {
        toast.error('Payment system not configured. Please contact support.')
        setLoading(false)
        return
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create checkout session')
      }

      // Redirect to Stripe Checkout
      if (result.url) {
        window.location.href = result.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#0b0f14' }}>
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <img src="/logo-premium.png" alt="HyveWyre™" className="h-32 w-32 rounded-3xl" />
          </div>
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#e6e9f0' }}>
            Welcome to HyveWyre™!
          </h1>
          <p className="text-xl" style={{ color: '#9ca3af' }}>
            Choose the plan that's right for you
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Basic Plan */}
          <div
            onClick={() => setSelectedPlan('basic')}
            className={`rounded-2xl p-8 cursor-pointer transition-all duration-200 ${
              selectedPlan === 'basic'
                ? 'shadow-[0_0_30px_rgba(59,130,246,0.4)] border-2 border-blue-500'
                : 'border border-white/10 hover:border-white/20'
            }`}
            style={{
              background: selectedPlan === 'basic' ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#e6e9f0' }}>
                Basic
              </h2>
              <div className="text-4xl font-bold mb-2" style={{ color: '#3b82f6' }}>
                $30<span className="text-lg font-normal">/mo</span>
              </div>
              <p style={{ color: '#9ca3af' }}>Perfect for getting started</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold" style={{ color: '#e6e9f0' }}>3,000 Credits/Month</div>
                  <div className="text-sm" style={{ color: '#9ca3af' }}>Renews automatically every 30 days</div>
                </div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold" style={{ color: '#e6e9f0' }}>Discounted Credit Packs</div>
                  <div className="text-sm" style={{ color: '#9ca3af' }}>Buy more credits at discounted rates</div>
                </div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold" style={{ color: '#e6e9f0' }}>5,000 Upload Limit</div>
                  <div className="text-sm" style={{ color: '#9ca3af' }}>Start with 5k contacts, increase with good behavior</div>
                </div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>Lead Management & Scoring</div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>Conversation Flows</div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>Bulk Messaging</div>
              </div>
            </div>
          </div>

          {/* Premium Plan */}
          <div
            onClick={() => setSelectedPlan('premium')}
            className={`rounded-2xl p-8 cursor-pointer transition-all duration-200 relative ${
              selectedPlan === 'premium'
                ? 'shadow-[0_0_30px_rgba(168,85,247,0.4)] border-2 border-purple-500'
                : 'border border-white/10 hover:border-white/20'
            }`}
            style={{
              background: selectedPlan === 'premium' ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="absolute top-4 right-4 bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              POPULAR
            </div>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#e6e9f0' }}>
                Premium
              </h2>
              <div className="text-4xl font-bold mb-2" style={{ color: '#a855f7' }}>
                $98<span className="text-lg font-normal">/mo</span>
              </div>
              <p style={{ color: '#9ca3af' }}>For serious marketers</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold" style={{ color: '#e6e9f0' }}>10,000 Credits/Month</div>
                  <div className="text-sm" style={{ color: '#9ca3af' }}>3x more than Basic</div>
                </div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold" style={{ color: '#e6e9f0' }}>Major Credit Discounts</div>
                  <div className="text-sm" style={{ color: '#9ca3af' }}>Get the best rates on additional credits</div>
                </div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <div className="font-semibold" style={{ color: '#e6e9f0' }}>Unlimited Upload Limit</div>
                  <div className="text-sm" style={{ color: '#9ca3af' }}>No restrictions on contact uploads</div>
                </div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>Priority Support</div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>Advanced Analytics</div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>Google Calendar Integration</div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>Custom Workflows & Automation</div>
              </div>

              <div className="flex items-start">
                <svg className="w-6 h-6 mr-3 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="font-semibold" style={{ color: '#e6e9f0' }}>All Basic Features</div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={handleSelectPlan}
            disabled={!selectedPlan || loading}
            className="px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: selectedPlan === 'premium' ? '#a855f7' : '#3b82f6',
              color: 'white',
            }}
          >
            {loading ? 'Redirecting to checkout...' : `Continue to Payment - ${selectedPlan === 'premium' ? '$98' : selectedPlan === 'basic' ? '$30' : ''}/mo`}
          </button>

          <p className="mt-4 text-sm" style={{ color: '#9ca3af' }}>
            Secure payment via Stripe • Cancel anytime • Upgrade or downgrade later
          </p>
        </div>
      </div>
    </div>
  )
}
