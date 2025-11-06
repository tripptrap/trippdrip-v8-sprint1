"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION_FEATURES } from "@/lib/subscriptionFeatures";
import toast from "react-hot-toast";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'professional' | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUser(user);

      // Check if user already has a subscription
      const { data: userData } = await supabase
        .from('users')
        .select('subscription_status, credits')
        .eq('id', user.id)
        .single();

      if (userData?.subscription_status && userData.subscription_status !== 'none') {
        // User already has a subscription, redirect to dashboard
        router.push('/dashboard');
      }
    };
    checkUser();
  }, []);

  const handleSelectPlan = (plan: 'starter' | 'professional') => {
    setSelectedPlan(plan);
    setStep(2);
  };

  const handleSkipForNow = async () => {
    // Allow user to skip and explore with 0 credits
    router.push('/dashboard');
  };

  const handleStartPayment = async () => {
    if (!selectedPlan) return;

    setLoading(true);
    try {
      // TODO: Integrate with Stripe to create checkout session
      // For now, just show a message
      toast.error('Payment integration coming soon! Click "Skip for Now" to explore the app.');

      // When Stripe is integrated, this will redirect to Stripe checkout:
      // const response = await fetch('/api/stripe/create-checkout', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ plan: selectedPlan })
      // });
      // const { url } = await response.json();
      // window.location.href = url;
    } catch (error) {
      toast.error('Failed to start payment process');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419] relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-white/10'} text-white font-bold`}>
              {step > 1 ? '✓' : '1'}
            </div>
            <div className={`h-1 w-20 ${step >= 2 ? 'bg-blue-600' : 'bg-white/10'}`} />
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-white/10'} text-white font-bold`}>
              2
            </div>
          </div>
          <div className="text-center text-white/60 text-sm">
            {step === 1 ? 'Choose Your Plan' : 'Complete Setup'}
          </div>
        </div>

        {/* Step 1: Plan Selection */}
        {step === 1 && (
          <div>
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-white mb-4">
                Welcome to HyveWyre™!
              </h1>
              <p className="text-xl text-white/60">
                Choose a plan to start engaging with your leads
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-8">
              {/* Starter Plan */}
              <div className="p-8 bg-white/5 border-2 border-white/10 rounded-2xl hover:border-blue-500/50 transition-all cursor-pointer"
                onClick={() => handleSelectPlan('starter')}>
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">Starter</h3>
                  <div className="text-5xl font-bold text-white mb-2">$30</div>
                  <div className="text-white/60">per month</div>
                </div>
                <div className="space-y-3 mb-8">
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>{SUBSCRIPTION_FEATURES.starter.monthlyCredits.toLocaleString()} credits/month</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>Up to {SUBSCRIPTION_FEATURES.starter.maxContacts.toLocaleString()} contacts</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>{SUBSCRIPTION_FEATURES.starter.maxCampaigns} campaigns</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>AI responses & generation</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>Bulk messaging</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>Email integration</span>
                  </div>
                </div>
                <button
                  onClick={() => handleSelectPlan('starter')}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all"
                >
                  Select Starter
                </button>
              </div>

              {/* Professional Plan */}
              <div className="relative p-8 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-2 border-purple-500 rounded-2xl cursor-pointer"
                onClick={() => handleSelectPlan('professional')}>
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-bold px-4 py-1 rounded-full">
                  MOST POPULAR
                </div>
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">Professional</h3>
                  <div className="text-5xl font-bold text-white mb-2">$98</div>
                  <div className="text-white/60">per month</div>
                </div>
                <div className="space-y-3 mb-8">
                  <div className="flex items-center gap-3 text-white font-semibold">
                    <span className="text-green-400">✓</span>
                    <span>{SUBSCRIPTION_FEATURES.professional.monthlyCredits.toLocaleString()} credits/month</span>
                  </div>
                  <div className="flex items-center gap-3 text-white font-semibold">
                    <span className="text-green-400">✓</span>
                    <span>Unlimited contacts</span>
                  </div>
                  <div className="flex items-center gap-3 text-white font-semibold">
                    <span className="text-green-400">✓</span>
                    <span>Unlimited campaigns</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>Advanced AI (GPT-4)</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>Advanced analytics</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>API & Webhooks</span>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-green-400">✓</span>
                    <span>Priority support</span>
                  </div>
                </div>
                <button
                  onClick={() => handleSelectPlan('professional')}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all"
                >
                  Select Professional
                </button>
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleSkipForNow}
                className="text-white/60 hover:text-white transition-colors"
              >
                Skip for now and explore with limited access
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Payment */}
        {step === 2 && selectedPlan && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-white mb-4">
                Complete Your Setup
              </h1>
              <p className="text-xl text-white/60">
                You selected the <span className="text-white font-bold capitalize">{selectedPlan}</span> plan
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-8">
              <h3 className="text-xl font-bold text-white mb-4">Order Summary</h3>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                <div>
                  <div className="text-white font-semibold capitalize">{selectedPlan} Plan</div>
                  <div className="text-sm text-white/60">Monthly subscription</div>
                </div>
                <div className="text-2xl font-bold text-white">
                  ${selectedPlan === 'starter' ? '30' : '98'}
                </div>
              </div>
              <div className="space-y-2 text-white/80 text-sm mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>
                    {selectedPlan === 'starter'
                      ? SUBSCRIPTION_FEATURES.starter.monthlyCredits.toLocaleString()
                      : SUBSCRIPTION_FEATURES.professional.monthlyCredits.toLocaleString()}
                    credits per month
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Credits renew automatically on your billing date</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Cancel anytime</span>
                </div>
              </div>

              <button
                onClick={handleStartPayment}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
              >
                {loading ? 'Processing...' : 'Continue to Payment'}
              </button>

              <button
                onClick={() => setStep(1)}
                className="w-full py-3 text-white/60 hover:text-white transition-colors"
              >
                ← Back to plan selection
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={handleSkipForNow}
                className="text-white/60 hover:text-white transition-colors text-sm"
              >
                Skip for now and explore with limited access
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
