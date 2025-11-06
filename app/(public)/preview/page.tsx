"use client";

import { useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_FEATURES } from "@/lib/subscriptionFeatures";

export default function PreviewPage() {
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'premium'>('basic');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Navigation */}
        <nav className="relative z-10 flex items-center justify-between p-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <img src="/logo-premium.png" alt="HyveWyre" className="w-10 h-10 rounded-2xl" />
            <span className="text-2xl font-bold text-white">HyveWyre™</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg transition-all"
            >
              Get Started
            </Link>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 text-center">
          <div className="inline-block mb-4 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full text-blue-400 text-sm font-medium">
            AI-Powered SMS & Email Marketing
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            Engage Your Leads<br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Like Never Before
            </span>
          </h1>
          <p className="text-xl text-white/60 mb-8 max-w-3xl mx-auto">
            Automate personalized conversations, nurture leads with AI, and close more deals with intelligent SMS and email campaigns.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => {
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg shadow-blue-500/20"
            >
              View Pricing
            </button>
            <Link
              href="/auth/register"
              className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-all border border-white/10"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Everything You Need to Scale
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">AI-Powered Responses</h3>
            <p className="text-white/60">
              Let AI craft personalized responses based on context and conversation history. Save hours while maintaining authentic engagement.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Bulk Campaigns</h3>
            <p className="text-white/60">
              Send thousands of personalized messages at once. Segment your audience and deliver the right message to the right people.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Advanced Analytics</h3>
            <p className="text-white/60">
              Track opens, clicks, replies, and conversions. Make data-driven decisions with comprehensive reporting and insights.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Smart Automation</h3>
            <p className="text-white/60">
              Create automated follow-up sequences that adapt based on recipient behavior. Never miss a lead opportunity.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Team Collaboration</h3>
            <p className="text-white/60">
              Work together seamlessly with shared inboxes, assignments, and notes. Keep everyone on the same page.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">TCPA Compliant</h3>
            <p className="text-white/60">
              Built-in compliance tools and opt-out management. Send messages with confidence knowing you're protected.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div id="pricing" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-white/60">
            Choose the plan that fits your business. All plans include monthly credit renewal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Starter Plan */}
          <div className="p-8 bg-white/5 border-2 border-white/10 rounded-2xl hover:border-blue-500/50 transition-all">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Starter</h3>
              <div className="text-5xl font-bold text-white mb-2">$30</div>
              <div className="text-white/60">per month</div>
            </div>
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">{SUBSCRIPTION_FEATURES.starter.monthlyCredits.toLocaleString()} credits/month</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Up to {SUBSCRIPTION_FEATURES.starter.maxContacts.toLocaleString()} contacts</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">{SUBSCRIPTION_FEATURES.starter.maxCampaigns} campaigns</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">AI responses & generation</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Bulk messaging</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Email integration</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">{SUBSCRIPTION_FEATURES.starter.pointPackDiscount}% off point packs</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Up to {SUBSCRIPTION_FEATURES.starter.teamMembers} team members</span>
              </div>
            </div>
            <Link
              href="/auth/register?plan=starter"
              className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-center transition-all"
            >
              Get Started
            </Link>
          </div>

          {/* Professional Plan */}
          <div className="relative p-8 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-2 border-purple-500 rounded-2xl">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-bold px-4 py-1 rounded-full">
              MOST POPULAR
            </div>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Professional</h3>
              <div className="text-5xl font-bold text-white mb-2">$98</div>
              <div className="text-white/60">per month</div>
            </div>
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white font-semibold">{SUBSCRIPTION_FEATURES.professional.monthlyCredits.toLocaleString()} credits/month</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white font-semibold">Unlimited contacts</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white font-semibold">Unlimited campaigns</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Advanced AI (GPT-4)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Advanced analytics</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Custom branding</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">API & Webhooks</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">{SUBSCRIPTION_FEATURES.professional.pointPackDiscount}% off point packs</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Unlimited team members</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Priority support</span>
              </div>
            </div>
            <Link
              href="/auth/register?plan=professional"
              className="block w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg text-center transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>

        <div className="text-center mt-12">
          <p className="text-white/60">
            All plans include automatic monthly credit renewal. Credits roll over each month.
          </p>
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Outreach?
          </h2>
          <p className="text-xl text-white/60 mb-8 max-w-2xl mx-auto">
            Join thousands of businesses already using HyveWyre™ to engage, nurture, and convert more leads.
          </p>
          <Link
            href="/auth/register"
            className="inline-block px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg shadow-blue-500/20"
          >
            Get Started Now
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">T</span>
              </div>
              <span className="text-white font-semibold">HyveWyre™</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/60">
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/compliance" className="hover:text-white transition-colors">Compliance</Link>
              <Link href="/auth/login" className="hover:text-white transition-colors">Sign In</Link>
            </div>
          </div>
          <div className="text-center mt-6 text-sm text-white/40">
            © 2025 HyveWyre™. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
