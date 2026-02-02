'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { INDUSTRY_PRESETS, getTagColor } from '@/lib/industryPresets'
import toast from 'react-hot-toast'
import { Phone, Loader2, CheckCircle, MapPin, ArrowRight, ArrowLeft, Calendar, Building2, Clock, Tag, PartyPopper, CreditCard, Zap, Bot, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import { getFlowTemplate, type FlowTemplate } from '@/lib/flowTemplates'
import { getReceptionistPreset, type ReceptionistPreset } from '@/lib/receptionistPresets'

// ── Types ──────────────────────────────────────────────────────────────────
interface PoolNumber {
  id: string
  phone_number: string
  friendly_name: string | null
  number_type: string
  area_code: string | null
  region: string | null
  capabilities: { sms?: boolean; mms?: boolean; voice?: boolean } | null
}

interface TelnyxNumber {
  phoneNumber: string
  friendlyName: string
  locality: string
  region: string
  numberType: string
  capabilities: { voice: boolean; sms: boolean; mms: boolean }
  monthlyPrice: string | null
  upfrontPrice: string | null
  reservable: boolean
}

type NumberSource = 'pool' | 'telnyx'

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ── Main Component ─────────────────────────────────────────────────────────
function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stepParam = searchParams.get('step')
  const isPostPayment = searchParams.get('success') === 'true'
  const isCalendarReturn = searchParams.get('calendar_connected') === 'true'

  // Determine initial step
  const getInitialStep = () => {
    if (stepParam) return parseInt(stepParam)
    return 1
  }

  const [currentStep, setCurrentStep] = useState(getInitialStep)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left')
  const [isAnimating, setIsAnimating] = useState(false)

  const goToStep = (step: number) => {
    setSlideDirection(step > currentStep ? 'left' : 'right')
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep(step)
      setIsAnimating(false)
    }, 200)
  }
  const [loading, setLoading] = useState(false)
  const [userIndustry, setUserIndustry] = useState<string>('other')
  const [userPlan, setUserPlan] = useState<string | null>(null)
  const [userCredits, setUserCredits] = useState(0)

  // Step 1: Plan selection
  const [selectedPlan, setSelectedPlan] = useState<'growth' | 'scale' | null>(null)

  // Step 2: Business setup
  const [businessName, setBusinessName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string; enabled: boolean }>>(() => {
    const hours: Record<string, { open: string; close: string; enabled: boolean }> = {}
    DAYS.forEach(day => {
      hours[day] = { open: '09:00', close: '17:00', enabled: day !== 'Saturday' && day !== 'Sunday' }
    })
    return hours
  })

  // Step 3: Phone number
  const [poolNumbers, setPoolNumbers] = useState<PoolNumber[]>([])
  const [telnyxNumbers, setTelnyxNumbers] = useState<TelnyxNumber[]>([])
  const [numberSource, setNumberSource] = useState<NumberSource>('pool')
  const [selectedPoolNumber, setSelectedPoolNumber] = useState<PoolNumber | null>(null)
  const [selectedTelnyxNumber, setSelectedTelnyxNumber] = useState<TelnyxNumber | null>(null)
  const [numbersLoading, setNumbersLoading] = useState(false)
  const [claimedNumber, setClaimedNumber] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [hasExistingNumber, setHasExistingNumber] = useState(false)

  // Step 4: Industry presets
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([])
  const [presetsApplied, setPresetsApplied] = useState(false)

  // Step 5: AI Setup
  const [flowTemplate, setFlowTemplate] = useState<FlowTemplate | null>(null)
  const [receptionistPreset, setReceptionistPreset] = useState<ReceptionistPreset | null>(null)
  const [flowName, setFlowName] = useState('')
  const [greetingMessage, setGreetingMessage] = useState('')
  const [receptionistEnabled, setReceptionistEnabled] = useState(true)
  const [aiSetupApplied, setAiSetupApplied] = useState(false)
  const [aiSetupLoading, setAiSetupLoading] = useState(false)
  const [showFlowPreview, setShowFlowPreview] = useState(false)

  // Step 6: Calendar
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarLoading, setCalendarLoading] = useState(false)

  // Fetch user data on mount
  useEffect(() => {
    const fetchUserData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get industry from user metadata
      const industry = user.user_metadata?.industry || 'other'
      const normalizedIndustry = industry.toLowerCase().replace(/[\s\/]+/g, '_')
      setUserIndustry(normalizedIndustry)

      // Set default presets for the industry
      const presets = INDUSTRY_PRESETS[normalizedIndustry] || INDUSTRY_PRESETS.other
      setSelectedTags(presets.tags)
      setSelectedCampaigns(presets.campaigns)

      // Set AI setup templates
      const ft = getFlowTemplate(normalizedIndustry)
      const rp = getReceptionistPreset(normalizedIndustry)
      setFlowTemplate(ft)
      setReceptionistPreset(rp)
      setFlowName(ft.name)
      setGreetingMessage(rp.greetingMessage)

      // Check subscription status
      const { data: userData } = await supabase
        .from('users')
        .select('subscription_tier, credits, business_name, timezone')
        .eq('id', user.id)
        .single()

      if (userData) {
        setUserPlan(userData.subscription_tier)
        setUserCredits(userData.credits || 0)
        if (userData.business_name) setBusinessName(userData.business_name)
        if (userData.timezone) setTimezone(userData.timezone)
      }

      // Check calendar status
      try {
        const calRes = await fetch('/api/calendar/status')
        const calData = await calRes.json()
        if (calData.connected || isCalendarReturn) setCalendarConnected(true)
      } catch {
        if (isCalendarReturn) setCalendarConnected(true)
      }

      // Check if user has a phone number already
      try {
        const numRes = await fetch('/api/telnyx/numbers')
        const numData = await numRes.json()
        if (numData.numbers && numData.numbers.length > 0) {
          setHasExistingNumber(true)
          setClaimedNumber(numData.numbers[0].phone_number)
        }
      } catch {}
    }
    fetchUserData()
  }, [router])

  // ── Step 1: Plan Selection ───────────────────────────────────────────────
  const handleSelectPlan = async () => {
    if (!selectedPlan) {
      toast.error('Please select a plan')
      return
    }
    setLoading(true)
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not authenticated')
        router.push('/auth/login')
        return
      }

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionType: selectedPlan })
      })
      const result = await response.json()

      if (result.setup) {
        toast.error('Payment system not configured. Please contact support.')
        setLoading(false)
        return
      }
      if (!response.ok) throw new Error(result.error || 'Failed to create checkout session')

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

  // ── Step 2: Business Setup ───────────────────────────────────────────────
  const handleSaveBusiness = async () => {
    setLoading(true)
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase.from('users').update({
        business_name: businessName,
        timezone: timezone,
        business_hours: businessHours,
        updated_at: new Date().toISOString()
      }).eq('id', user.id)

      if (error) throw error
      goToStep(3)
    } catch (error: any) {
      toast.error(error.message || 'Failed to save business info')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Phone Number ─────────────────────────────────────────────────
  const fetchAvailableNumbers = useCallback(async () => {
    setNumbersLoading(true)
    try {
      // Try number pool first
      const poolRes = await fetch('/api/number-pool/available')
      const poolData = await poolRes.json()

      if (poolData.success && poolData.numbers?.length > 0) {
        setPoolNumbers(poolData.numbers)
        setNumberSource('pool')
        setNumbersLoading(false)
        return
      }

      // Fall back to Telnyx toll-free search
      const telRes = await fetch('/api/telnyx/search-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tollFree: true, countryCode: 'US', limit: 10 })
      })
      const telData = await telRes.json()

      if (telData.success && telData.numbers?.length > 0) {
        setTelnyxNumbers(telData.numbers)
        setNumberSource('telnyx')
      }
    } catch (err) {
      console.error('Error fetching numbers:', err)
    } finally {
      setNumbersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentStep === 3 && !hasExistingNumber && poolNumbers.length === 0 && telnyxNumbers.length === 0) {
      fetchAvailableNumbers()
    }
  }, [currentStep, hasExistingNumber, poolNumbers.length, telnyxNumbers.length, fetchAvailableNumbers])

  const handleClaimNumber = async () => {
    setClaiming(true)
    try {
      if (numberSource === 'pool' && selectedPoolNumber) {
        const res = await fetch('/api/number-pool/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numberId: selectedPoolNumber.id })
        })
        const data = await res.json()
        if (data.success) {
          setClaimedNumber(selectedPoolNumber.phone_number)
          setHasExistingNumber(true)
          toast.success('Number claimed!')
        } else {
          toast.error(data.error || 'Failed to claim number')
        }
      } else if (numberSource === 'telnyx' && selectedTelnyxNumber) {
        const res = await fetch('/api/telnyx/purchase-number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: selectedTelnyxNumber.phoneNumber })
        })
        const data = await res.json()
        if (data.success) {
          setClaimedNumber(selectedTelnyxNumber.phoneNumber)
          setHasExistingNumber(true)
          toast.success('Number claimed!')
        } else {
          toast.error(data.error || 'Failed to claim number')
        }
      }
    } catch (err) {
      toast.error('Failed to claim number')
    } finally {
      setClaiming(false)
    }
  }

  // ── Step 4: Industry Presets ─────────────────────────────────────────────
  const handleApplyPresets = async () => {
    setLoading(true)
    try {
      // Create tags
      for (const tagName of selectedTags) {
        await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tagName, color: getTagColor(selectedTags.indexOf(tagName)) })
        })
      }

      // Create campaigns
      for (const campaignName of selectedCampaigns) {
        await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: campaignName })
        })
      }

      setPresetsApplied(true)
      toast.success('Presets applied!')
      goToStep(5)
    } catch (err) {
      toast.error('Failed to apply some presets')
      goToStep(5)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 5: AI Setup ────────────────────────────────────────────────────
  const handleApplyAISetup = async () => {
    if (!flowTemplate) return
    setAiSetupLoading(true)
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const bName = businessName || 'our company'

      // Replace {businessName} placeholders in flow template context
      const context = {
        whoYouAre: flowTemplate.context.whoYouAre.replace(/{businessName}/g, bName),
        whatOffering: flowTemplate.context.whatOffering.replace(/{businessName}/g, bName),
        whoTexting: flowTemplate.context.whoTexting.replace(/{businessName}/g, bName),
        clientGoals: flowTemplate.context.clientGoals.replace(/{businessName}/g, bName),
      }

      // Create the starter flow
      const now = new Date().toISOString()
      const { error: flowError } = await supabase
        .from('conversation_flows')
        .insert({
          user_id: user.id,
          name: flowName || flowTemplate.name,
          context,
          steps: flowTemplate.steps,
          required_questions: flowTemplate.requiredQuestions,
          requires_call: flowTemplate.requiresCall,
          created_at: now,
          updated_at: now,
        })

      if (flowError) {
        console.error('Error creating flow:', flowError)
        toast.error('Failed to create starter flow')
      }

      // Save receptionist settings
      if (receptionistEnabled && receptionistPreset) {
        const systemPrompt = receptionistPreset.systemPrompt.replace(/{businessName}/g, bName)
        const greeting = greetingMessage.replace(/{businessName}/g, bName)
        const afterHours = receptionistPreset.afterHoursMessage.replace(/{businessName}/g, bName)

        // Convert business hours to receptionist format
        const enabledDays = Object.entries(businessHours)
          .filter(([, v]) => v.enabled)
          .map(([day]) => DAYS.indexOf(day) + 1) // 1=Monday, 7=Sunday

        const firstEnabled = Object.values(businessHours).find(h => h.enabled)

        const receptionistRes = await fetch('/api/receptionist/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            system_prompt: systemPrompt,
            greeting_message: greeting,
            after_hours_message: afterHours,
            business_hours_enabled: true,
            business_hours_start: (firstEnabled?.open || '09:00') + ':00',
            business_hours_end: (firstEnabled?.close || '17:00') + ':00',
            business_hours_timezone: timezone,
            business_days: enabledDays.length > 0 ? enabledDays : [1, 2, 3, 4, 5],
            respond_to_new_contacts: true,
            auto_create_leads: true,
            calendar_enabled: false,
          }),
        })

        if (!receptionistRes.ok) {
          const errData = await receptionistRes.json()
          console.error('Receptionist save error:', errData)
        }
      }

      setAiSetupApplied(true)
      toast.success('AI setup complete!')
      goToStep(6)
    } catch (err) {
      console.error('AI setup error:', err)
      toast.error('Failed to apply AI setup')
    } finally {
      setAiSetupLoading(false)
    }
  }

  // ── Step 6: Google Calendar ──────────────────────────────────────────────
  const handleConnectCalendar = async () => {
    setCalendarLoading(true)
    try {
      const res = await fetch('/api/calendar/oauth?from=onboarding')
      const data = await res.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        toast.error('Failed to start calendar connection')
      }
    } catch {
      toast.error('Failed to connect calendar')
    } finally {
      setCalendarLoading(false)
    }
  }

  // ── Step 7: Completion ───────────────────────────────────────────────────
  const handleFinish = async () => {
    // Mark phone as selected in DB (already handled in onboarding step 3)
    // Let the remaining modals fire on dashboard: theme → tour → congrats
    try {
      await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_selected: true })
      })
    } catch {}
    router.push('/dashboard')
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  const formatPhone = (phone: string) => {
    const d = phone.replace(/\D/g, '')
    if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    return phone
  }

  const totalSteps = 7
  const CheckIcon = () => (
    <svg className="w-6 h-6 mr-3 flex-shrink-0 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )

  const getIndustryLabel = (key: string) => {
    const labels: Record<string, string> = {
      insurance: 'Insurance', real_estate: 'Real Estate', solar: 'Solar', roofing: 'Roofing',
      home_services: 'Home Services', financial_services: 'Financial Services', healthcare: 'Healthcare',
      automotive: 'Automotive', retail: 'Retail/E-commerce', other: 'General'
    }
    return labels[key] || 'General'
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#FAF8F5] overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, #14b8a6 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="max-w-5xl w-full relative z-10">
        {/* Progress bar */}
        {currentStep > 1 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Step {currentStep} of {totalSteps}</span>
              <span className="text-sm text-gray-500">{Math.round((currentStep / totalSteps) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Step content with animations */}
        <div
          key={currentStep}
          className={isAnimating ? 'opacity-0' : (slideDirection === 'left' ? 'onb-slide-left' : 'onb-slide-right')}
        >

        {/* ═══ STEP 1: Plan Selection ═══ */}
        {currentStep === 1 && (
          <>
            <div className="text-center mb-12">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-3xl flex items-center justify-center shadow-lg shadow-teal-500/20 onb-pop-in">
                  <span className="text-white font-bold text-3xl">HW</span>
                </div>
              </div>
              <h1 className="text-4xl font-bold mb-3 text-gray-900 onb-fade-up-d1">Welcome to HyveWyre&#8482;!</h1>
              <p className="text-xl text-gray-500 onb-fade-up-d2">Choose the plan that&apos;s right for you</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* Growth Plan */}
              <div
                onClick={() => setSelectedPlan('growth')}
                className={`rounded-2xl p-8 cursor-pointer transition-all duration-200 bg-white onb-fade-up-d2 ${
                  selectedPlan === 'growth'
                    ? 'shadow-[0_0_30px_rgba(20,184,166,0.2)] border-2 border-teal-500 ring-2 ring-teal-500/20'
                    : 'border border-gray-200 hover:border-teal-300 hover:shadow-lg'
                }`}
              >
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold mb-2 text-gray-900">Growth</h2>
                  <div className="text-4xl font-bold mb-2 text-teal-600">$30<span className="text-lg font-normal text-gray-500">/mo</span></div>
                  <p className="text-gray-500">Everything you need to get started</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start"><CheckIcon /><div><div className="font-semibold text-gray-900">3,000 Credits/Month</div><div className="text-sm text-gray-500">Renews automatically every 30 days</div></div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Unlimited Contacts & Campaigns</div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">AI Responses & Receptionist</div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Bulk Messaging & Drips</div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Advanced Analytics</div></div>
                  <div className="flex items-start"><CheckIcon /><div><div className="font-semibold text-gray-900">10% Off Point Packs</div><div className="text-sm text-gray-500">Buy more credits at discounted rates</div></div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Priority Support</div></div>
                </div>
              </div>

              {/* Scale Plan */}
              <div
                onClick={() => setSelectedPlan('scale')}
                className={`rounded-2xl p-8 cursor-pointer transition-all duration-200 relative bg-white onb-fade-up-d3 ${
                  selectedPlan === 'scale'
                    ? 'shadow-[0_0_30px_rgba(20,184,166,0.2)] border-2 border-teal-500 ring-2 ring-teal-500/20'
                    : 'border border-gray-200 hover:border-teal-300 hover:shadow-lg'
                }`}
              >
                <div className="absolute top-4 right-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-3 py-1 rounded-full text-sm font-semibold">POPULAR</div>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold mb-2 text-gray-900">Scale</h2>
                  <div className="text-4xl font-bold mb-2 text-teal-600">$98<span className="text-lg font-normal text-gray-500">/mo</span></div>
                  <p className="text-gray-500">More credits, bigger discounts</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start"><CheckIcon /><div><div className="font-semibold text-gray-900">10,000 Credits/Month</div><div className="text-sm text-gray-500">3x more than Growth</div></div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Unlimited Contacts & Campaigns</div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">AI Responses & Receptionist</div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Bulk Messaging & Drips</div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Advanced Analytics</div></div>
                  <div className="flex items-start"><CheckIcon /><div><div className="font-semibold text-gray-900">30% Off Point Packs</div><div className="text-sm text-gray-500">Best rates on additional credits</div></div></div>
                  <div className="flex items-start"><CheckIcon /><div className="font-semibold text-gray-900">Priority Support</div></div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleSelectPlan}
                disabled={!selectedPlan || loading}
                className="px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-600 hover:to-cyan-600 shadow-lg shadow-teal-500/20"
              >
                {loading ? 'Redirecting to checkout...' : `Continue to Payment - ${selectedPlan === 'scale' ? '$98' : selectedPlan === 'growth' ? '$30' : ''}/mo`}
              </button>
              <p className="mt-4 text-sm text-gray-500">Secure payment via Stripe &bull; Cancel anytime &bull; Upgrade or downgrade later</p>
            </div>
          </>
        )}

        {/* ═══ STEP 2: Business Setup ═══ */}
        {currentStep === 2 && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20 onb-pop-in">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-gray-900 onb-fade-up-d1">Set Up Your Business</h1>
              <p className="text-gray-500 onb-fade-up-d2">Tell us about your business so we can customize your experience</p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm space-y-6 onb-fade-up-d2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your business name"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all text-gray-900"
                >
                  {US_TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Business Hours
                </label>
                <div className="space-y-2">
                  {DAYS.map(day => (
                    <div key={day} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 w-28">
                        <input
                          type="checkbox"
                          checked={businessHours[day].enabled}
                          onChange={(e) => setBusinessHours(prev => ({
                            ...prev,
                            [day]: { ...prev[day], enabled: e.target.checked }
                          }))}
                          className="rounded border-gray-300 text-teal-500 focus:ring-teal-500"
                        />
                        <span className="text-sm text-gray-700">{day.slice(0, 3)}</span>
                      </label>
                      {businessHours[day].enabled ? (
                        <div className="flex items-center gap-2 text-sm">
                          <input
                            type="time"
                            value={businessHours[day].open}
                            onChange={(e) => setBusinessHours(prev => ({
                              ...prev,
                              [day]: { ...prev[day], open: e.target.value }
                            }))}
                            className="px-2 py-1 rounded border border-gray-300 text-gray-900"
                          />
                          <span className="text-gray-400">to</span>
                          <input
                            type="time"
                            value={businessHours[day].close}
                            onChange={(e) => setBusinessHours(prev => ({
                              ...prev,
                              [day]: { ...prev[day], close: e.target.value }
                            }))}
                            className="px-2 py-1 rounded border border-gray-300 text-gray-900"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Closed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveBusiness}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-5 h-5" /></>}
              </button>
              <button
                onClick={() => goToStep(3)}
                className="px-6 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Phone Number ═══ */}
        {currentStep === 3 && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20 onb-pop-in">
                <Phone className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-gray-900 onb-fade-up-d1">Choose Your Phone Number</h1>
              <p className="text-gray-500 onb-fade-up-d2">Pick a toll-free number to send and receive messages</p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm onb-fade-up-d2">
              {hasExistingNumber && claimedNumber ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Number Ready!</h3>
                  <p className="text-gray-600 text-lg">{formatPhone(claimedNumber)}</p>
                </div>
              ) : numbersLoading ? (
                <div className="flex flex-col items-center py-12">
                  <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-3" />
                  <p className="text-sm text-gray-400">Searching for available numbers...</p>
                </div>
              ) : (
                <>
                  <p className="text-gray-500 mb-4 text-center text-sm">Select a toll-free number — it&apos;s included free with your plan.</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {numberSource === 'pool' ? poolNumbers.map(num => (
                      <button
                        key={num.id}
                        onClick={() => { setSelectedPoolNumber(num); setSelectedTelnyxNumber(null) }}
                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                          selectedPoolNumber?.id === num.id
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-gray-900">{formatPhone(num.phone_number)}</div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                              {num.region && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{num.region}</span>}
                              <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium">{num.number_type || 'Toll-Free'}</span>
                            </div>
                          </div>
                          {selectedPoolNumber?.id === num.id && <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>}
                        </div>
                      </button>
                    )) : telnyxNumbers.map(num => (
                      <button
                        key={num.phoneNumber}
                        onClick={() => { setSelectedTelnyxNumber(num); setSelectedPoolNumber(null) }}
                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                          selectedTelnyxNumber?.phoneNumber === num.phoneNumber
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-gray-900">{formatPhone(num.phoneNumber)}</div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                              {num.region && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{num.region}</span>}
                              <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium">Toll-Free</span>
                            </div>
                          </div>
                          {selectedTelnyxNumber?.phoneNumber === num.phoneNumber && <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>}
                        </div>
                      </button>
                    ))}
                    {poolNumbers.length === 0 && telnyxNumbers.length === 0 && !numbersLoading && (
                      <div className="text-center py-8">
                        <Phone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No numbers available right now.</p>
                        <p className="text-sm text-gray-400">You can add one later from Phone Numbers settings.</p>
                      </div>
                    )}
                  </div>

                  {(selectedPoolNumber || selectedTelnyxNumber) && (
                    <button
                      onClick={handleClaimNumber}
                      disabled={claiming}
                      className="w-full mt-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {claiming ? <><Loader2 className="w-5 h-5 animate-spin" />Claiming...</> : <>Claim This Number <ArrowRight className="w-5 h-5" /></>}
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => goToStep(2)}
                className="px-6 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => goToStep(4)}
                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2"
              >
                {hasExistingNumber ? 'Continue' : 'Skip for Now'} <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Industry Presets ═══ */}
        {currentStep === 4 && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20 onb-pop-in">
                <Tag className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-gray-900 onb-fade-up-d1">Set Up Your Pipeline</h1>
              <p className="text-gray-500 onb-fade-up-d2">We&apos;ve selected presets for <span className="font-semibold text-teal-600">{getIndustryLabel(userIndustry)}</span>. Customize as needed.</p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm space-y-6 onb-fade-up-d2">
              {/* Pipeline tags */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Pipeline Stages</label>
                <p className="text-xs text-gray-500 mb-3">These tags track where each lead is in your sales process.</p>
                <div className="flex flex-wrap gap-2">
                  {(INDUSTRY_PRESETS[userIndustry] || INDUSTRY_PRESETS.other).tags.map(tag => {
                    const isSelected = selectedTags.includes(tag)
                    return (
                      <button
                        key={tag}
                        onClick={() => setSelectedTags(prev => isSelected ? prev.filter(t => t !== tag) : [...prev, tag])}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                          isSelected
                            ? 'bg-teal-50 border-teal-500 text-teal-700'
                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 inline mr-1" />}
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Campaign types */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Campaign Types</label>
                <p className="text-xs text-gray-500 mb-3">Categories for organizing your leads by product or service.</p>
                <div className="flex flex-wrap gap-2">
                  {(INDUSTRY_PRESETS[userIndustry] || INDUSTRY_PRESETS.other).campaigns.map(campaign => {
                    const isSelected = selectedCampaigns.includes(campaign)
                    return (
                      <button
                        key={campaign}
                        onClick={() => setSelectedCampaigns(prev => isSelected ? prev.filter(c => c !== campaign) : [...prev, campaign])}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                          isSelected
                            ? 'bg-teal-50 border-teal-500 text-teal-700'
                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 inline mr-1" />}
                        {campaign}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => goToStep(3)}
                className="px-6 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleApplyPresets}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Apply & Continue <ArrowRight className="w-5 h-5" /></>}
              </button>
              <button
                onClick={() => goToStep(5)}
                className="px-6 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 5: AI Setup ═══ */}
        {currentStep === 5 && (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20 onb-pop-in">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-gray-900 onb-fade-up-d1">Set Up Your AI</h1>
              <p className="text-gray-500 onb-fade-up-d2">We&apos;ve created a starter flow and receptionist based on your <span className="font-semibold text-teal-600">{getIndustryLabel(userIndustry)}</span> industry.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 onb-fade-up-d2">
              {/* Card 1: Starter Flow */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-teal-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Starter Flow</h3>
                </div>
                <p className="text-xs text-gray-400 mb-4">An AI conversation template that qualifies your leads and books appointments automatically. You can edit this anytime from the <span className="font-medium text-teal-600">Flows</span> page.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Flow Name</label>
                    <input
                      type="text"
                      value={flowName}
                      onChange={(e) => setFlowName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none text-sm text-gray-900"
                    />
                  </div>

                  {flowTemplate && (
                    <>
                      <div>
                        <div className="text-sm font-medium text-gray-600 mb-1">Context</div>
                        <div className="text-xs text-gray-500 space-y-1 bg-gray-50 rounded-lg p-3">
                          <p><span className="font-medium text-gray-700">Who you are:</span> {flowTemplate.context.whoYouAre.replace(/{businessName}/g, businessName || 'your business')}</p>
                          <p><span className="font-medium text-gray-700">Offering:</span> {flowTemplate.context.whatOffering}</p>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium text-gray-600 mb-1">Qualifying Questions</div>
                        <div className="space-y-1">
                          {flowTemplate.requiredQuestions.map((q, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <div className="w-5 h-5 bg-teal-100 rounded-full flex items-center justify-center text-[10px] font-bold text-teal-700">{i + 1}</div>
                              {q.question}
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => setShowFlowPreview(!showFlowPreview)}
                        className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
                      >
                        {showFlowPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {showFlowPreview ? 'Hide' : 'Preview'} conversation steps
                      </button>

                      {showFlowPreview && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {flowTemplate.steps.map((step, i) => (
                            <div key={step.id} className="bg-gray-50 rounded-lg p-3 text-xs">
                              <div className="font-medium text-gray-700 mb-1">Step {i + 1}</div>
                              <div className="text-gray-600">{step.yourMessage}</div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {step.responses.map((r, j) => (
                                  <span key={j} className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-[10px]">{r.label}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Card 2: Receptionist */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                      <Bot className="w-5 h-5 text-sky-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Receptionist</h3>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receptionistEnabled}
                      onChange={(e) => setReceptionistEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-teal-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
                  </label>
                </div>
                <p className="text-xs text-gray-400 mb-4">Your AI receptionist auto-responds to incoming messages, handles after-hours inquiries, and creates leads. You can edit this anytime from the <span className="font-medium text-teal-600">Receptionist</span> page.</p>

                {receptionistEnabled && receptionistPreset ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Greeting Message</label>
                      <textarea
                        value={greetingMessage.replace(/{businessName}/g, businessName || '{businessName}')}
                        onChange={(e) => setGreetingMessage(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none text-sm text-gray-900 resize-none"
                      />
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-600 mb-1">AI Behavior</div>
                      <div className="text-xs text-gray-500 space-y-1.5 bg-gray-50 rounded-lg p-3">
                        {receptionistPreset.systemPrompt.split('RULES:')[1]?.split('\n').filter(l => l.trim().startsWith('-')).slice(0, 4).map((rule, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <CheckCircle className="w-3 h-3 text-teal-500 mt-0.5 flex-shrink-0" />
                            <span>{rule.replace(/^-\s*/, '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-600 mb-1">After Hours Message</div>
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 italic">
                        {receptionistPreset.afterHoursMessage.replace(/{businessName}/g, businessName || 'your business')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    Receptionist is disabled. Toggle on to auto-respond to incoming messages.
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => goToStep(4)}
                className="px-6 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleApplyAISetup}
                disabled={aiSetupLoading}
                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {aiSetupLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Apply & Continue <ArrowRight className="w-5 h-5" /></>}
              </button>
              <button
                onClick={() => goToStep(6)}
                className="px-6 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 6: Google Calendar ═══ */}
        {currentStep === 6 && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20 onb-pop-in">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-gray-900 onb-fade-up-d1">Connect Your Calendar</h1>
              <p className="text-gray-500 onb-fade-up-d2">Link Google Calendar so leads can book appointments directly</p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm text-center onb-fade-up-d2">
              {calendarConnected ? (
                <div className="py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Calendar Connected!</h3>
                  <p className="text-gray-500">Your Google Calendar is linked and ready to go.</p>
                </div>
              ) : (
                <div className="py-4">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="text-gray-500 mb-6">When AI qualifies a lead, it can automatically book an appointment on your calendar.</p>
                  <button
                    onClick={handleConnectCalendar}
                    disabled={calendarLoading}
                    className="px-8 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:border-teal-500 hover:text-teal-600 transition-all flex items-center justify-center gap-3 mx-auto disabled:opacity-50"
                  >
                    {calendarLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Connect Google Calendar
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => goToStep(5)}
                className="px-6 py-3 border border-gray-300 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => goToStep(7)}
                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2"
              >
                {calendarConnected ? 'Continue' : 'Skip for Now'} <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 7: Completion ═══ */}
        {currentStep === 7 && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-sky-500 to-teal-500 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20 onb-pop-in">
                <PartyPopper className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-gray-900 onb-fade-up-d1">You&apos;re All Set!</h1>
              <p className="text-gray-500 onb-fade-up-d2">Here&apos;s a summary of your account</p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm space-y-3 onb-fade-up-d3">
              {/* Plan */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-sky-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{userPlan === 'scale' ? 'Scale' : 'Growth'} Plan</div>
                  <div className="text-sm text-gray-500">Subscription active</div>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>

              {/* Credits */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{userCredits.toLocaleString()} Credits</div>
                  <div className="text-sm text-gray-500">Ready to send messages</div>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>

              {/* Phone */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{claimedNumber ? formatPhone(claimedNumber) : 'No Number'}</div>
                  <div className="text-sm text-gray-500">{claimedNumber ? 'Ready to send & receive' : 'Add one later in Phone Numbers'}</div>
                </div>
                {claimedNumber ? <CheckCircle className="w-5 h-5 text-green-500" /> : <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full">Skipped</span>}
              </div>

              {/* Pipeline */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Tag className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Pipeline & Campaigns</div>
                  <div className="text-sm text-gray-500">{presetsApplied ? `${selectedTags.length} stages, ${selectedCampaigns.length} campaigns` : 'Using defaults'}</div>
                </div>
                {presetsApplied ? <CheckCircle className="w-5 h-5 text-green-500" /> : <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full">Skipped</span>}
              </div>

              {/* AI Setup */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">AI Setup</div>
                  <div className="text-sm text-gray-500">{aiSetupApplied ? 'Starter flow & receptionist configured' : 'Set up later in Flows & Receptionist'}</div>
                </div>
                {aiSetupApplied ? <CheckCircle className="w-5 h-5 text-green-500" /> : <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full">Skipped</span>}
              </div>

              {/* Calendar */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Google Calendar</div>
                  <div className="text-sm text-gray-500">{calendarConnected ? 'Connected' : 'Connect later in Settings'}</div>
                </div>
                {calendarConnected ? <CheckCircle className="w-5 h-5 text-green-500" /> : <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full">Skipped</span>}
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="w-full mt-6 py-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold text-lg rounded-xl hover:from-teal-600 hover:to-cyan-600 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2"
            >
              Go to Dashboard <ArrowRight className="w-5 h-5" />
            </button>

            <p className="text-center text-sm text-gray-400 mt-3">
              You can change any of these settings later
            </p>
          </div>
        )}

        </div>{/* end animation wrapper */}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
