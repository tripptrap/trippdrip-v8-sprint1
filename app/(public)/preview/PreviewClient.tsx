"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { SUBSCRIPTION_FEATURES } from "@/lib/subscriptionFeatures";
import TelnyxDiamond from "@/components/preview/TelnyxDiamond";

export default function PreviewClient() {
  const [selectedPlan, setSelectedPlan] = useState<string>('basic');
  const [showDemo, setShowDemo] = useState(false);
  const [demoTab, setDemoTab] = useState('dashboard');
  const [selectedConversation, setSelectedConversation] = useState(0);
  const [selectedLead, setSelectedLead] = useState<number | null>(null);

  const demoConversations = [
    {
      id: 0,
      name: 'Michael Chen',
      phone: '(555) 234-5678',
      message: 'Thanks for the info!',
      time: '2m ago',
      unread: true,
      messages: [
        { sender: 'lead', text: "Hi! I'm interested in home insurance quotes.", time: '10:32 AM' },
        { sender: 'agent', text: "Great! I'd be happy to help. What type of property do you own?", time: '10:35 AM' },
        { sender: 'lead', text: 'Single family home, 3 bed 2 bath.', time: '10:38 AM' },
        { sender: 'agent', text: 'Perfect! What\'s the approximate square footage and age of the home?', time: '10:40 AM' },
        { sender: 'lead', text: 'About 2,000 sq ft, built in 2010', time: '10:42 AM' },
      ]
    },
    {
      id: 1,
      name: 'Jennifer Martinez',
      phone: '(555) 345-6789',
      message: 'What are the rates?',
      time: '1h ago',
      unread: true,
      messages: [
        { sender: 'lead', text: 'Hi, I got your message about property insurance', time: '9:15 AM' },
        { sender: 'agent', text: 'Yes! Thanks for reaching out. Are you looking for home or commercial property insurance?', time: '9:18 AM' },
        { sender: 'lead', text: 'Home insurance for my new house', time: '9:22 AM' },
        { sender: 'agent', text: 'Congratulations on the new home! I can definitely help with that. When did you close?', time: '9:25 AM' },
        { sender: 'lead', text: 'Last week. What are the rates?', time: '9:30 AM' },
      ]
    },
    {
      id: 2,
      name: 'David Thompson',
      phone: '(555) 456-7890',
      message: "I'm interested",
      time: '3h ago',
      unread: false,
      messages: [
        { sender: 'lead', text: 'Saw your listing for the 3BR on Oak Street', time: '7:45 AM' },
        { sender: 'agent', text: 'Great property! Are you looking to schedule a showing?', time: '7:50 AM' },
        { sender: 'lead', text: "I'm interested. What's the HOA fee?", time: '8:00 AM' },
        { sender: 'agent', text: 'The HOA is $250/month and includes lawn care and pool access. Would you like to see it this weekend?', time: '8:05 AM' },
      ]
    },
    {
      id: 3,
      name: 'Sarah Johnson',
      phone: '(555) 567-8901',
      message: 'Can we schedule a call?',
      time: '1d ago',
      unread: false,
      messages: [
        { sender: 'lead', text: 'Hi, I need to review my current policy', time: 'Yesterday 2:30 PM' },
        { sender: 'agent', text: 'Of course! I can help you review your policy. What concerns do you have?', time: 'Yesterday 2:35 PM' },
        { sender: 'lead', text: 'My premium went up and I want to understand why', time: 'Yesterday 2:40 PM' },
        { sender: 'agent', text: 'I understand your concern. Can we schedule a call to review the details together?', time: 'Yesterday 2:45 PM' },
        { sender: 'lead', text: 'Can we schedule a call?', time: 'Yesterday 3:00 PM' },
      ]
    },
  ];

  const demoLeads = [
    { id: 1, name: 'Michael Chen', phone: '(555) 234-5678', email: 'mchen@email.com', status: 'Active', temp: 'Hot', last: '2 hours ago', state: 'CA', tags: ['Insurance', 'Hot Lead'] },
    { id: 2, name: 'Jennifer Martinez', phone: '(555) 345-6789', email: 'jmartinez@email.com', status: 'Active', temp: 'Warm', last: '1 day ago', state: 'TX', tags: ['New Home', 'Insurance'] },
    { id: 3, name: 'David Thompson', phone: '(555) 456-7890', email: 'dthompson@email.com', status: 'Active', temp: 'Hot', last: '3 hours ago', state: 'FL', tags: ['Real Estate', 'Showing'] },
    { id: 4, name: 'Sarah Johnson', phone: '(555) 567-8901', email: 'sjohnson@email.com', status: 'Nurture', temp: 'Warm', last: '2 days ago', state: 'NY', tags: ['Policy Review'] },
    { id: 5, name: 'Robert Williams', phone: '(555) 678-9012', email: 'rwilliams@email.com', status: 'Active', temp: 'Cold', last: '1 week ago', state: 'WA', tags: ['Follow-up'] },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, #1a1a1a 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Navigation */}
        <nav className="relative z-10 flex items-center justify-between p-4 sm:p-6 max-w-7xl mx-auto gap-4">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center">
                <span className="text-white font-bold text-xs sm:text-sm">HW</span>
              </div>
              <span className="text-lg sm:text-2xl font-bold text-gray-900 whitespace-nowrap">HyveWyre</span>
            </div>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium flex items-center gap-1"
              >
                Features
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={() => document.getElementById('industries')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium flex items-center gap-1"
              >
                Industries
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium"
              >
                Pricing
              </button>
              <button
                onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium"
              >
                FAQ
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/auth/login"
                className="px-3 py-2 sm:px-4 text-sm sm:text-base text-gray-700 hover:text-gray-900 transition-colors whitespace-nowrap inline-block"
              >
                Sign In
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/auth/register"
                className="px-4 py-2 sm:px-6 text-sm sm:text-base bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-lg transition-all whitespace-nowrap inline-block"
              >
                Get Started
              </Link>
            </motion.div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20">
          {/* 3D Diamond - positioned on right */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden lg:block opacity-90 pointer-events-none">
            <TelnyxDiamond />
          </div>

          <div className="text-left max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-block mb-4 px-4 py-2 bg-teal-50 border border-teal-200 rounded-full text-teal-600 text-sm font-medium"
            >
              AI-Powered SMS & Email Marketing
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-5xl md:text-7xl font-bold text-gray-900 mb-6"
            >
              AI-Powered SMS Marketing for Insurance & Real Estate Agents<br />
              <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                Automate Conversations, Close More Deals
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-xl text-gray-600 mb-8 max-w-2xl"
            >
              Automate personalized conversations, nurture leads with AI, and close more deals with intelligent SMS and email campaigns.
            </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-col items-start gap-4"
          >
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(20, 184, 166, 0.2)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-lg transition-all shadow-lg"
              >
                View Pricing
              </motion.button>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href="/auth/register"
                  className="inline-block px-8 py-4 bg-white hover:bg-gray-50 text-gray-900 font-semibold rounded-lg transition-all border border-gray-200 shadow-sm"
                >
                  Create Account
                </Link>
              </motion.div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 15px 30px rgba(20, 184, 166, 0.15)" }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowDemo(true)}
              className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/20"
            >
              View Demo
            </motion.button>
          </motion.div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="max-w-7xl mx-auto px-6 py-20 border-b border-gray-200">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Get Started in Minutes
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            No complex setup. No waiting for verification. Start sending messages today.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { step: '1', title: 'Create Account', desc: 'Sign up in under a minute. Choose your plan and get instant access to all features.', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
            { step: '2', title: 'Get Your Number', desc: 'Claim a pre-verified phone number instantly from our shared pool. No A2P wait times.', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
            { step: '3', title: 'Import Leads', desc: 'Upload your CSV, connect your CRM, or add leads manually. We handle the rest.', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
            { step: '4', title: 'Start Sending', desc: 'Launch campaigns, set up AI workflows, and watch your response rates soar.', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              className="relative text-center"
            >
              {i < 3 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-emerald-500/50 to-transparent" />
              )}
              <div className="relative z-10 w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
              </div>
              <div className="text-teal-600 text-sm font-bold mb-2">STEP {item.step}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-gray-600">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Product Deep Dive Section */}
      <div className="max-w-7xl mx-auto px-6 py-20 border-b border-gray-200">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything You Need to Dominate Your Market
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            A complete SMS & email marketing platform built specifically for insurance agents, real estate professionals, and sales teams.
          </p>
        </motion.div>

        {/* Feature Deep Dive 1: AI Conversations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="text-teal-600 font-semibold mb-2">AI-POWERED CONVERSATIONS</div>
            <h3 className="text-3xl font-bold text-gray-900 mb-4">Let AI Handle the Conversation</h3>
            <p className="text-gray-600 mb-6">
              Our GPT-4 powered AI doesn't just send canned responses—it understands context, sentiment, and intent. It qualifies leads, answers questions, and hands off to you when the deal is hot.
            </p>
            <ul className="space-y-3">
              {['Natural, human-like responses', 'Sentiment analysis & lead scoring', 'Smart handoff when leads are ready', 'Custom personality & tone settings', '24/7 automated engagement'].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-700">
                  <span className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                    <span className="text-teal-600 text-sm">✓</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-white/5 to-white/10 border border-gray-200 rounded-2xl p-6"
          >
            {/* Mock AI Conversation */}
            <div className="space-y-4">
              <div className="flex justify-start">
                <div className="bg-white shadow-sm rounded-lg px-4 py-2 max-w-[80%]">
                  <p className="text-gray-700">Hi, I saw your ad about home insurance. What kind of rates do you offer?</p>
                  <p className="text-gray-400 text-xs mt-1">Lead • 2:34 PM</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-teal-500 rounded-lg px-4 py-2 max-w-[80%]">
                  <p className="text-gray-700">Great question! Our rates depend on a few factors. Could you tell me about your home? Is it a single-family house, condo, or townhome?</p>
                  <p className="text-gray-600 text-xs mt-1 flex items-center gap-1">
                    <span className="w-3 h-3 bg-teal-500 rounded-full animate-pulse"></span>
                    AI Response • 2:34 PM
                  </p>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-white shadow-sm rounded-lg px-4 py-2 max-w-[80%]">
                  <p className="text-gray-700">Single family, 3 bed 2 bath, built in 2015</p>
                  <p className="text-gray-400 text-xs mt-1">Lead • 2:36 PM</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-teal-500 rounded-lg px-4 py-2 max-w-[80%]">
                  <p className="text-gray-700">Perfect! A newer home like that typically qualifies for great rates. What's your zip code? I'll pull up specific quotes for your area.</p>
                  <p className="text-gray-600 text-xs mt-1 flex items-center gap-1">
                    <span className="w-3 h-3 bg-teal-500 rounded-full animate-pulse"></span>
                    AI Response • 2:36 PM
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-teal-50 border border-teal-300 rounded-lg">
                <p className="text-teal-600 text-sm font-medium">🎯 Lead Score: Hot (87/100)</p>
                <p className="text-gray-600 text-xs mt-1">AI detected high intent. Ready for agent handoff.</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Feature Deep Dive 2: Campaign Builder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="order-2 lg:order-1 bg-gradient-to-br from-white/5 to-white/10 border border-gray-200 rounded-2xl p-6"
          >
            {/* Mock Campaign Builder */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <h4 className="text-gray-900 font-semibold">Spring Insurance Campaign</h4>
                <span className="px-3 py-1 bg-teal-100 text-teal-600 text-sm rounded-full">Draft</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-gray-600 text-sm">Recipients</p>
                  <p className="text-gray-900 font-bold text-xl">2,847</p>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <p className="text-gray-600 text-sm">Est. Cost</p>
                  <p className="text-gray-900 font-bold text-xl">$42.70</p>
                </div>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <p className="text-gray-600 text-sm mb-2">Message Preview</p>
                <p className="text-gray-700">Hi {'{{first_name}}'}, thanks for requesting info about home insurance! With storm season approaching, let's make sure you're covered. Reply YES for a free quote!</p>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-teal-100 text-teal-600 text-xs rounded">Homeowners</span>
                <span className="px-2 py-1 bg-teal-100 text-teal-600 text-xs rounded">Texas</span>
                <span className="px-2 py-1 bg-teal-100 text-teal-500 text-xs rounded">Active Leads</span>
              </div>
              <button className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold rounded-lg">
                Schedule Campaign →
              </button>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="order-1 lg:order-2"
          >
            <div className="text-teal-600 font-semibold mb-2">BULK SMS & EMAIL CAMPAIGNS</div>
            <h3 className="text-3xl font-bold text-gray-900 mb-4">Send Thousands of Personalized Messages</h3>
            <p className="text-gray-600 mb-6">
              Build campaigns in minutes with our intuitive builder. Segment your audience, personalize every message, and schedule sends for optimal times.
            </p>
            <ul className="space-y-3">
              {['Dynamic personalization (name, location, etc.)', 'Smart audience segmentation', 'A/B testing for optimization', 'Scheduled & drip campaigns', 'Real-time delivery tracking'].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-700">
                  <span className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                    <span className="text-teal-600 text-sm">✓</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Feature Deep Dive 3: CRM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="text-teal-600 font-semibold mb-2">BUILT-IN CRM</div>
            <h3 className="text-3xl font-bold text-gray-900 mb-4">Your Leads, Organized</h3>
            <p className="text-gray-600 mb-6">
              No more spreadsheets or switching between apps. HyveWyre keeps all your leads, conversations, and notes in one place with powerful filtering and tagging.
            </p>
            <ul className="space-y-3">
              {['Import from CSV or connect existing CRM', 'Custom tags & lead temperature scoring', 'Full conversation history per lead', 'Notes, follow-ups & reminders', 'Export anytime—your data is yours'].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-700">
                  <span className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                    <span className="text-teal-600 text-sm">✓</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-white/5 to-white/10 border border-gray-200 rounded-2xl p-6"
          >
            {/* Mock CRM View */}
            <div className="space-y-3">
              {[
                { name: 'Michael Chen', phone: '(555) 234-5678', status: 'Hot', tags: ['Insurance', 'Homeowner'], last: '2 hours ago' },
                { name: 'Sarah Williams', phone: '(555) 345-6789', status: 'Warm', tags: ['Real Estate', 'Buyer'], last: '1 day ago' },
                { name: 'David Thompson', phone: '(555) 456-7890', status: 'Hot', tags: ['Insurance', 'Policy Review'], last: '3 hours ago' },
              ].map((lead, i) => (
                <div key={i} className="p-4 bg-white rounded-lg border border-gray-200 hover:border-teal-300 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {lead.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-gray-900 font-medium">{lead.name}</p>
                        <p className="text-gray-600 text-sm">{lead.phone}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${lead.status === 'Hot' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {lead.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {lead.tags.map((tag, j) => (
                        <span key={j} className="px-2 py-0.5 bg-teal-100 text-teal-600 text-xs rounded">{tag}</span>
                      ))}
                    </div>
                    <span className="text-gray-400 text-xs">{lead.last}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Industry Use Cases Section */}
      <div id="industries" className="max-w-7xl mx-auto px-6 py-20 border-b border-gray-200">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Built for Your Industry
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Whether you're selling policies or properties, HyveWyre adapts to your workflow.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              industry: 'Insurance Agents',
              icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
              useCases: ['Policy renewal reminders', 'New lead qualification', 'Quote follow-ups', 'Claims status updates', 'Cross-sell opportunities'],
              stat: '73%',
              statLabel: 'avg response rate'
            },
            {
              industry: 'Real Estate Agents',
              icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
              useCases: ['New listing alerts', 'Open house invitations', 'Price drop notifications', 'Showing confirmations', 'Market updates'],
              stat: '68%',
              statLabel: 'showing conversion'
            },
            {
              industry: 'Mortgage Brokers',
              icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
              useCases: ['Rate change alerts', 'Application status updates', 'Document reminders', 'Pre-approval follow-ups', 'Refinance opportunities'],
              stat: '4.2x',
              statLabel: 'ROI on campaigns'
            },
            {
              industry: 'Solar Sales',
              icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
              useCases: ['Free assessment offers', 'Incentive deadline reminders', 'Installation scheduling', 'Referral requests', 'Maintenance reminders'],
              stat: '52%',
              statLabel: 'lead-to-consult rate'
            },
            {
              industry: 'Auto Dealerships',
              icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
              useCases: ['Service reminders', 'New inventory alerts', 'Lease expiration notices', 'Trade-in offers', 'Special promotions'],
              stat: '89%',
              statLabel: 'service retention'
            },
            {
              industry: 'Home Services',
              icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
              useCases: ['Appointment confirmations', 'Quote follow-ups', 'Seasonal promotions', 'Review requests', 'Maintenance schedules'],
              stat: '61%',
              statLabel: 'booking rate'
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              whileHover={{ y: -5, boxShadow: "0 20px 40px rgba(20, 184, 166, 0.2)" }}
              className="p-6 bg-white border border-gray-200 rounded-xl hover:border-teal-400 transition-all"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900">{item.industry}</h3>
              </div>
              <ul className="space-y-2 mb-4">
                {item.useCases.map((useCase, j) => (
                  <li key={j} className="flex items-center gap-2 text-gray-500 text-sm">
                    <span className="text-teal-600">•</span>
                    {useCase}
                  </li>
                ))}
              </ul>
              <div className="pt-4 border-t border-gray-200">
                <div className="text-3xl font-bold text-teal-600">{item.stat}</div>
                <div className="text-gray-600 text-sm">{item.statLabel}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div id="faq" className="max-w-4xl mx-auto px-6 py-20 border-b border-gray-200">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Frequently Asked Questions
          </h2>
        </motion.div>

        <div className="space-y-4">
          {[
            {
              q: 'How quickly can I start sending messages?',
              a: 'Immediately after signup! Unlike other platforms that require 1-7 days for A2P verification, HyveWyre provides pre-verified phone numbers from our shared pool. Choose your plan, claim a number, and start sending in under 5 minutes.'
            },
            {
              q: 'Is HyveWyre TCPA compliant?',
              a: 'Absolutely. We have built-in compliance tools including opt-out management, consent tracking, and message frequency controls. We also provide templates that follow TCPA best practices.'
            },
            {
              q: 'How does the AI conversation feature work?',
              a: 'Our AI is powered by GPT-4 and trained specifically for sales conversations. It can qualify leads, answer questions about your services, and intelligently hand off to you when a lead is ready to buy. You customize its personality, knowledge base, and when it should alert you.'
            },
            {
              q: 'Can I use my own phone number?',
              a: 'Yes! You can bring your own Twilio number or purchase a dedicated number through us. Our instant-access pool is great for getting started, and you can upgrade to a dedicated number anytime.'
            },
            {
              q: 'What happens if I run out of credits?',
              a: 'You can purchase additional credit packs anytime at discounted rates (up to 20% off with Professional plan). Your campaigns will pause if you run out, and you\'ll be notified before that happens.'
            },
            {
              q: 'Can I import my existing leads?',
              a: 'Yes! Upload a CSV file with your leads and we\'ll map the fields automatically. You can also connect via API or Zapier (coming soon) to sync with your existing CRM.'
            },
            {
              q: 'Is there a contract or can I cancel anytime?',
              a: 'No contracts, no commitments. HyveWyre is month-to-month and you can cancel anytime. Your data is always exportable so you\'re never locked in.'
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              viewport={{ once: true }}
              className="p-6 bg-white border border-gray-200 rounded-xl hover:border-teal-300 transition-colors"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.q}</h3>
              <p className="text-gray-600">{item.a}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="max-w-7xl mx-auto px-6 py-20">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12"
        >
          Everything You Need to Scale
        </motion.h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(20, 184, 166, 0.25)",
            }}
            className="p-6 bg-white border border-gray-200 rounded-xl hover:bg-white shadow-sm transition-all hover:border-teal-400"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">AI-Powered Responses</h3>
            <p className="text-gray-600">
              Let AI craft personalized responses based on context and conversation history. Save hours while maintaining authentic engagement.
            </p>
          </motion.div>

          {/* Feature 2 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(20, 184, 166, 0.25)",
            }}
            className="p-6 bg-white border border-gray-200 rounded-xl hover:bg-white shadow-sm transition-all hover:border-teal-400"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Bulk Campaigns</h3>
            <p className="text-gray-600">
              Send thousands of personalized messages at once. Segment your audience and deliver the right message to the right people.
            </p>
          </motion.div>

          {/* Feature 3 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(34, 197, 94, 0.25)",
            }}
            className="p-6 bg-white border border-gray-200 rounded-xl hover:bg-white shadow-sm transition-all hover:border-teal-400"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Advanced Analytics</h3>
            <p className="text-gray-600">
              Track opens, clicks, replies, and conversions. Make data-driven decisions with comprehensive reporting and insights.
            </p>
          </motion.div>

          {/* Feature 4 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(249, 115, 22, 0.25)",
            }}
            className="p-6 bg-white border border-gray-200 rounded-xl hover:bg-white shadow-sm transition-all hover:border-teal-400"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Smart Automation</h3>
            <p className="text-gray-600">
              Create automated follow-up sequences that adapt based on recipient behavior. Never miss a lead opportunity.
            </p>
          </motion.div>

          {/* Feature 5 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(236, 72, 153, 0.25)",
            }}
            className="p-6 bg-white border border-gray-200 rounded-xl hover:bg-white shadow-sm transition-all hover:border-teal-400"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Workflow Management</h3>
            <p className="text-gray-600">
              Organize your leads with tags, notes, and custom dispositions. Create powerful workflows that match your process.
            </p>
          </motion.div>

          {/* Feature 6 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(6, 182, 212, 0.25)",
            }}
            className="p-6 bg-white border border-gray-200 rounded-xl hover:bg-white shadow-sm transition-all hover:border-teal-400"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">TCPA Compliant</h3>
            <p className="text-gray-600">
              Built-in compliance tools and opt-out management. Send messages with confidence knowing you're protected.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Comparison Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why Choose HyveWyre™?
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We're not just another marketing platform. Here's how we stack up against the competition.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="overflow-x-auto"
        >
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left p-4 text-gray-600 font-medium">Feature</th>
                <th className="p-4 text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-lg">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-600 to-cyan-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-xs">HW</span>
                    </div>
                    <span className="text-gray-900 font-bold">HyveWyre™</span>
                  </div>
                </th>
                <th className="p-4 text-center text-gray-600 font-medium">Competitor A</th>
                <th className="p-4 text-center text-gray-600 font-medium">Competitor B</th>
                <th className="p-4 text-center text-gray-600 font-medium">Competitor C</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">AI-Powered Responses</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-sm">Basic</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-xl">✗</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-sm">Limited</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">SMS + Email Combined</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-sm">SMS Only</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">Instant Number Access</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-sm">1-7 days</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-sm">1-7 days</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-500/20 rounded-full">
                    <span className="text-gray-400 text-sm">N/A</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">Built-in CRM</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-sm">Basic</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">Sentiment Analysis</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-xl">✗</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-xl">✗</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-xl">✗</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">Smart Auto-Replies</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-sm">Basic</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-sm">Basic</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-sm">Basic</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">Drag & Drop Campaigns</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-xl">✗</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-teal-100 rounded-full">
                    <span className="text-teal-600 text-xl">✓</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-gray-200 hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">Starting Price</td>
                <td className="p-4 text-center">
                  <span className="text-teal-600 font-bold">$30/mo</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-gray-600">$25-$100/mo</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-gray-600">$109/mo</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-gray-600">$29-$259/mo</span>
                </td>
              </tr>

              <tr className="hover:bg-white transition-colors">
                <td className="p-4 text-gray-900">Setup Time</td>
                <td className="p-4 text-center">
                  <span className="text-teal-600 font-bold">5 minutes</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-gray-600">1-2 hours</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-gray-600">30-45 minutes</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-gray-600">1 hour</span>
                </td>
              </tr>
            </tbody>
          </table>
        </motion.div>

        {/* Key Differentiators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(20, 184, 166, 0.3)",
            }}
            className="p-6 bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 rounded-xl hover:border-teal-400 transition-all"
          >
            <div className="w-12 h-12 bg-teal-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Start Messaging Instantly</h3>
            <p className="text-gray-500">
              Unlike competitors where you wait 1-7 days for A2P verification, claim a pre-verified number from our shared pool and start sending messages in seconds.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(20, 184, 166, 0.3)",
            }}
            className="p-6 bg-gradient-to-br from-emerald-400/10 to-teal-600/5 border border-teal-200 rounded-xl hover:border-teal-400 transition-all"
          >
            <div className="w-12 h-12 bg-teal-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">True AI Intelligence</h3>
            <p className="text-gray-500">
              While others offer basic automation, we provide GPT-4 powered responses, sentiment analysis, and smart replies that actually understand context and tone.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.07,
              rotateX: 6,
              rotateY: -6,
              boxShadow: "0px 15px 40px rgba(34, 197, 94, 0.3)",
            }}
            className="p-6 bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 rounded-xl hover:border-teal-400 transition-all"
          >
            <div className="w-12 h-12 bg-teal-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">All-in-One Platform</h3>
            <p className="text-gray-500">
              Why pay $25-$259/mo for competitors when you get SMS, email, built-in CRM, AI automation, and sentiment analysis in one platform for just $30/mo?
            </p>
          </motion.div>
        </div>
      </div>

      {/* Pricing Section */}
      <div id="pricing" className="max-w-7xl mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600">
            Choose the plan that fits your business. All plans include monthly credit renewal.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Starter Plan */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.05,
              rotateX: 5,
              rotateY: 5,
              boxShadow: "0px 20px 45px rgba(20, 184, 166, 0.35)",
            }}
            className="p-8 bg-white border-2 border-gray-200 rounded-2xl hover:border-teal-400 transition-all"
          >
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Starter</h3>
              <div className="text-5xl font-bold text-gray-900 mb-2">$30</div>
              <div className="text-gray-600">per month</div>
            </div>
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">{SUBSCRIPTION_FEATURES.starter.monthlyCredits.toLocaleString()} credits/month</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Up to {SUBSCRIPTION_FEATURES.starter.maxContacts.toLocaleString()} contacts</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">{SUBSCRIPTION_FEATURES.starter.maxCampaigns} campaigns</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">AI responses & generation</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Bulk messaging</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Email integration</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">{SUBSCRIPTION_FEATURES.starter.pointPackDiscount}% off point packs</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Priority email support</span>
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/auth/register?plan=starter"
                className="block w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg text-center transition-all"
              >
                Get Started
              </Link>
            </motion.div>
          </motion.div>

          {/* Professional Plan */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{
              scale: 1.05,
              rotateX: 5,
              rotateY: 5,
              boxShadow: "0px 20px 45px rgba(20, 184, 166, 0.4)",
            }}
            className="relative p-8 bg-gradient-to-br from-teal-50 to-cyan-50 border-2 border-teal-400 rounded-2xl"
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-bold px-4 py-1 rounded-full">
              MOST POPULAR
            </div>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Professional</h3>
              <div className="text-5xl font-bold text-gray-900 mb-2">$98</div>
              <div className="text-gray-600">per month</div>
            </div>
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-900 font-semibold">{SUBSCRIPTION_FEATURES.professional.monthlyCredits.toLocaleString()} credits/month</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-900 font-semibold">Unlimited contacts</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-900 font-semibold">Unlimited campaigns</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Advanced AI (GPT-4)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Advanced analytics</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Custom branding</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">API & Webhooks</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">{SUBSCRIPTION_FEATURES.professional.pointPackDiscount}% off point packs</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Dedicated account manager</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-teal-600 text-xl">✓</span>
                <span className="text-gray-700">Priority support</span>
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/auth/register?plan=professional"
                className="block w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-teal-600 text-white font-semibold rounded-lg text-center transition-all"
              >
                Get Started
              </Link>
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <p className="text-gray-600">
            All plans include automatic monthly credit renewal. Credits roll over each month.
          </p>
        </motion.div>
      </div>

      {/* CTA Section */}
      <div className="max-w-5xl mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="bg-gradient-to-r from-teal-100 to-cyan-100 border border-teal-300 rounded-2xl p-8 md:p-12 text-center"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Ready to Transform Your Outreach?
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Join thousands of businesses already using HyveWyre™ to engage, nurture, and convert more leads.
          </p>
          <motion.div whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(20, 184, 166, 0.4)" }} whileTap={{ scale: 0.95 }}>
            <Link
              href="/auth/register"
              className="inline-block px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/20"
            >
              Get Started Now
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Team Section */}
      <div className="max-w-5xl mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Meet the Creators
          </h2>
          <p className="text-xl text-gray-600">
            The team behind HyveWyre™
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Tripp Browning */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{ y: -5, boxShadow: "0 20px 40px rgba(20, 184, 166, 0.3)" }}
            className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-2xl p-8 text-center"
          >
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-3xl">
              TB
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Tripp Browning</h3>
            <div className="text-teal-600 font-semibold mb-3">Lead Developer & CEO</div>
            <p className="text-gray-600 mb-4">
              Visionary founder and lead architect behind HyveWyre's innovative SMS automation platform. Passionate about building tools that empower businesses to connect with their customers.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/team/tripp-browning"
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                View Profile
              </Link>
            </div>
          </motion.div>

          {/* Carson Rios */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{ y: -5, boxShadow: "0 20px 40px rgba(20, 184, 166, 0.3)" }}
            className="bg-gradient-to-br from-emerald-400/10 to-teal-500/10 border border-teal-200 rounded-2xl p-8 text-center"
          >
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-3xl">
              CR
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Carson Rios</h3>
            <div className="text-teal-600 font-semibold mb-3">Co-Founder & CEO</div>
            <p className="text-gray-600 mb-4">
              Strategic co-founder driving HyveWyre's vision and growth. Dedicated to revolutionizing how businesses engage with leads through intelligent automation and personalized outreach.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/team/carson-rios"
                className="px-4 py-2 bg-teal-500 hover:bg-teal-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                View Profile
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">HW</span>
              </div>
              <span className="text-gray-900 font-semibold">HyveWyre™</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-900 transition-colors">Terms</Link>
              <Link href="/compliance" className="hover:text-gray-900 transition-colors">Compliance</Link>
              <Link href="/auth/login" className="hover:text-gray-900 transition-colors">Sign In</Link>
            </div>
          </div>
          <div className="text-center mt-6 text-sm text-gray-400">
            © 2025 HyveWyre™. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Demo Modal */}
      {showDemo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowDemo(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="w-full max-w-7xl h-[90vh] bg-[#FAF8F5] rounded-2xl border border-gray-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Demo Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xs">HW</span>
                </div>
                <span className="text-gray-900 font-semibold">HyveWyre Demo</span>
              </div>
              <button
                onClick={() => setShowDemo(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Demo Content */}
            <div className="flex h-[calc(100%-64px)]" onClick={(e) => e.stopPropagation()}>
              {/* Sidebar */}
              <div className="w-64 bg-white border-r border-gray-200 p-4">
                <div className="space-y-2">
                  <button
                    onClick={() => setDemoTab('dashboard')}
                    className={`w-full px-4 py-3 rounded-lg text-left font-medium transition-all ${
                      demoTab === 'dashboard'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => setDemoTab('leads')}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      demoTab === 'leads'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700 font-medium'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    Leads (247)
                  </button>
                  <button
                    onClick={() => setDemoTab('messages')}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      demoTab === 'messages'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700 font-medium'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    Messages (12)
                  </button>
                  <button
                    onClick={() => setDemoTab('campaigns')}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      demoTab === 'campaigns'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700 font-medium'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    Campaigns (8)
                  </button>
                  <button
                    onClick={() => setDemoTab('workflows')}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      demoTab === 'workflows'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700 font-medium'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    AI Workflows (5)
                  </button>
                  <button
                    onClick={() => setDemoTab('analytics')}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      demoTab === 'analytics'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700 font-medium'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    Analytics
                  </button>
                  <button
                    onClick={() => setDemoTab('templates')}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      demoTab === 'templates'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700 font-medium'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    Templates (23)
                  </button>
                  <button
                    onClick={() => setDemoTab('phone')}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      demoTab === 'phone'
                        ? 'bg-teal-100 border border-teal-300 text-teal-700 font-medium'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    Phone Numbers
                  </button>
                  <button
                    onClick={() => setDemoTab('plans')}
                    className={`w-full px-4 py-3 rounded-lg text-left font-medium transition-all ${
                      demoTab === 'plans'
                        ? 'bg-gradient-to-r from-emerald-400/30 to-amber-500/30 border border-teal-400 text-teal-600'
                        : 'bg-gradient-to-r from-teal-100 to-cyan-100 border border-teal-300 text-teal-500 hover:from-emerald-400/30 hover:to-amber-500/30'
                    }`}
                  >
                    Plans & Billing
                  </button>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 p-6 overflow-y-auto pointer-events-auto">
                {demoTab === 'dashboard' && (
                  <>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Dashboard Overview</h2>
                      <p className="text-gray-600">Welcome back, Sarah - Here's your performance for March 2025</p>
                    </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-white border border-gray-200 rounded-xl hover:border-teal-300 transition-colors">
                    <div className="text-gray-600 text-sm mb-1">Total Leads</div>
                    <div className="text-2xl font-bold text-white">1,847</div>
                    <div className="text-teal-600 text-sm mt-1">↑ 23% from last month</div>
                  </div>
                  <div className="p-4 bg-white border border-gray-200 rounded-xl hover:border-teal-300 transition-colors">
                    <div className="text-gray-600 text-sm mb-1">Active Campaigns</div>
                    <div className="text-2xl font-bold text-white">12</div>
                    <div className="text-teal-600 text-sm mt-1">5 scheduled, 7 running</div>
                  </div>
                  <div className="p-4 bg-white border border-gray-200 rounded-xl hover:border-teal-300 transition-colors">
                    <div className="text-gray-600 text-sm mb-1">Response Rate</div>
                    <div className="text-2xl font-bold text-white">72.4%</div>
                    <div className="text-teal-600 text-sm mt-1">↑ 8.3% from last week</div>
                  </div>
                  <div className="p-4 bg-white border border-gray-200 rounded-xl hover:border-teal-300 transition-colors">
                    <div className="text-gray-600 text-sm mb-1">AI Conversations</div>
                    <div className="text-2xl font-bold text-white">1,203</div>
                    <div className="text-teal-600 text-sm mt-1">94.7% automation</div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-teal-50 border border-teal-300 rounded-lg hover:bg-teal-100 transition-all text-left cursor-pointer">
                    <div className="text-teal-600 font-semibold">Send Campaign</div>
                    <div className="text-gray-600 text-sm mt-1">Start new outreach</div>
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-teal-50 border border-teal-400/30 rounded-lg hover:bg-teal-100 transition-all text-left cursor-pointer">
                    <div className="text-teal-600 font-semibold">Add Lead</div>
                    <div className="text-gray-600 text-sm mt-1">Import or create</div>
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-teal-50 border border-teal-300 rounded-lg hover:bg-teal-100 transition-all text-left cursor-pointer">
                    <div className="text-teal-600 font-semibold">AI Workflow</div>
                    <div className="text-gray-600 text-sm mt-1">Setup automation</div>
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-teal-50 border border-teal-400/30 rounded-lg hover:bg-teal-100 transition-all text-left cursor-pointer">
                    <div className="text-teal-600 font-semibold">View Analytics</div>
                    <div className="text-gray-600 text-sm mt-1">Deep dive stats</div>
                  </button>
                </div>

                {/* Active Campaigns */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Active Campaigns</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium">Spring Home Insurance Follow-up</div>
                          <div className="text-gray-600 text-sm">847 contacts • 68.2% open rate</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-teal-100 text-teal-600 text-sm rounded-full">Active</span>
                        <button className="text-gray-600 hover:text-gray-900">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium">New Property Listing Alerts</div>
                          <div className="text-gray-600 text-sm">1,203 contacts • 72.8% response rate</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-teal-100 text-teal-600 text-sm rounded-full">Active</span>
                        <button className="text-gray-600 hover:text-gray-900">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium">Policy Renewal Reminders</div>
                          <div className="text-gray-600 text-sm">Scheduled for Apr 1 • 523 contacts</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-teal-100 text-teal-600 text-sm rounded-full">Scheduled</span>
                        <button className="text-gray-600 hover:text-gray-900">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">New lead: Michael Chen</div>
                        <div className="text-gray-600 text-sm">Interested in home insurance • AI workflow started</div>
                      </div>
                      <div className="text-gray-400 text-sm">3 min ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">Campaign: Spring Home Insurance delivered</div>
                        <div className="text-gray-600 text-sm">847 messages sent • 576 delivered • 68.2% opened</div>
                      </div>
                      <div className="text-gray-400 text-sm">18 min ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">AI responded to Jennifer Martinez</div>
                        <div className="text-gray-600 text-sm">Answered question about coverage options</div>
                      </div>
                      <div className="text-gray-400 text-sm">42 min ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">Lead qualification alert</div>
                        <div className="text-gray-600 text-sm">David Thompson marked as hot lead - ready for call</div>
                      </div>
                      <div className="text-gray-400 text-sm">1 hour ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                      <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">Weekly report generated</div>
                        <div className="text-gray-600 text-sm">247 new leads, 72.4% response rate, $45.2K pipeline</div>
                      </div>
                      <div className="text-gray-400 text-sm">2 hours ago</div>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-6 p-6 bg-gradient-to-r from-teal-100 to-cyan-100 border border-teal-300 rounded-xl text-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to get started?</h3>
                  <p className="text-gray-600 mb-4">Sign up now to access all features and start automating your conversations</p>
                  <Link
                    href="/auth/register"
                    className="inline-block px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold rounded-lg transition-all"
                  >
                    Create Free Account
                  </Link>
                </div>
                  </>
                )}

                {/* LEADS TAB */}
                {demoTab === 'leads' && (
                  <>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Leads</h2>
                      <p className="text-gray-600">Manage and organize your leads - Click a lead to view details</p>
                    </div>

                    {/* Search and Filters */}
                    <div className="flex gap-4 mb-6">
                      <input
                        type="text"
                        placeholder="Search leads..."
                        className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-lg text-white placeholder-white/40"
                      />
                      <button className="px-6 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors">
                        + Add Lead
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Leads Table */}
                      <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-white border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-gray-700 text-sm font-medium">Name</th>
                              <th className="px-4 py-3 text-left text-gray-700 text-sm font-medium">Phone</th>
                              <th className="px-4 py-3 text-left text-gray-700 text-sm font-medium">Status</th>
                              <th className="px-4 py-3 text-left text-gray-700 text-sm font-medium">Temp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {demoLeads.map((lead) => (
                              <tr
                                key={lead.id}
                                onClick={() => setSelectedLead(lead.id)}
                                className={`border-b border-white/5 hover:bg-white transition-colors cursor-pointer ${
                                  selectedLead === lead.id ? 'bg-teal-50' : ''
                                }`}
                              >
                                <td className="px-4 py-3 text-white">{lead.name}</td>
                                <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-1 bg-teal-100 text-teal-600 text-sm rounded-full">
                                    {lead.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 text-sm rounded-full ${
                                    lead.temp === 'Hot' ? 'bg-red-500/20 text-red-400' :
                                    lead.temp === 'Warm' ? 'bg-teal-100 text-teal-600' :
                                    'bg-teal-100 text-teal-600'
                                  }`}>
                                    {lead.temp}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Lead Details Panel */}
                      <div className="bg-white border border-gray-200 rounded-xl p-6">
                        {selectedLead ? (
                          <>
                            <h3 className="text-white font-semibold text-lg mb-4">Lead Details</h3>
                            {(() => {
                              const lead = demoLeads.find(l => l.id === selectedLead);
                              if (!lead) return null;
                              return (
                                <div className="space-y-4">
                                  <div>
                                    <div className="text-gray-600 text-sm">Name</div>
                                    <div className="text-white font-medium">{lead.name}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600 text-sm">Phone</div>
                                    <div className="text-white">{lead.phone}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600 text-sm">Email</div>
                                    <div className="text-white">{lead.email}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600 text-sm">State</div>
                                    <div className="text-white">{lead.state}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600 text-sm">Tags</div>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      {lead.tags.map((tag, i) => (
                                        <span key={i} className="px-2 py-1 bg-teal-100 text-teal-600 text-sm rounded">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-600 text-sm">Last Contact</div>
                                    <div className="text-white">{lead.last}</div>
                                  </div>
                                  <button className="w-full mt-4 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors">
                                    Send Message
                                  </button>
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="text-center py-10 text-gray-400">
                            Select a lead to view details
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* MESSAGES TAB */}
                {demoTab === 'messages' && (
                  <>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Messages</h2>
                      <p className="text-gray-600">View and respond to conversations</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
                      {/* Conversations List */}
                      <div className="bg-white border border-gray-200 rounded-xl overflow-y-auto">
                        <div className="p-4 border-b border-gray-200">
                          <input
                            type="text"
                            placeholder="Search conversations..."
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-white placeholder-white/40"
                          />
                        </div>
                        {demoConversations.map((conv) => (
                          <div
                            key={conv.id}
                            onClick={() => setSelectedConversation(conv.id)}
                            className={`p-4 border-b border-white/5 hover:bg-white cursor-pointer transition-colors ${
                              selectedConversation === conv.id ? 'bg-teal-50 border-l-4 border-l-emerald-500' : ''
                            } ${conv.unread ? 'bg-teal-500/5' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-white font-medium">{conv.name}</div>
                              <div className="text-gray-400 text-sm">{conv.time}</div>
                            </div>
                            <div className="text-gray-600 text-sm truncate">{conv.message}</div>
                          </div>
                        ))}
                      </div>

                      {/* Conversation View */}
                      <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl flex flex-col">
                        <div className="p-4 border-b border-gray-200">
                          <div className="text-gray-900 font-semibold">{demoConversations[selectedConversation].name}</div>
                          <div className="text-gray-600 text-sm">{demoConversations[selectedConversation].phone}</div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4">
                          {demoConversations[selectedConversation].messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`rounded-lg px-4 py-2 max-w-[70%] ${
                                msg.sender === 'agent' ? 'bg-teal-500' : 'bg-white shadow-sm'
                              }`}>
                                <div className="text-white">{msg.text}</div>
                                <div className={`text-xs mt-1 ${msg.sender === 'agent' ? 'text-gray-600' : 'text-gray-400'}`}>
                                  {msg.time}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-4 border-t border-gray-200">
                          <input
                            type="text"
                            placeholder="Type a message..."
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-white placeholder-white/40"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* CAMPAIGNS TAB */}
                {demoTab === 'campaigns' && (
                  <>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Campaigns</h2>
                      <p className="text-gray-600">Create and manage SMS campaigns</p>
                    </div>

                    <button className="mb-6 px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition-colors">
                      + Create New Campaign
                    </button>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { name: 'Spring Home Insurance Follow-up', contacts: 847, sent: 847, opened: 577, replied: 203, status: 'Completed' },
                        { name: 'New Property Listing Alerts', contacts: 1203, sent: 1203, opened: 876, replied: 637, status: 'Active' },
                        { name: 'Policy Renewal Reminders', contacts: 523, sent: 0, opened: 0, replied: 0, status: 'Scheduled' },
                        { name: 'Open House Invitations', contacts: 342, sent: 342, opened: 248, replied: 89, status: 'Completed' },
                      ].map((campaign, i) => (
                        <div key={i} className="p-6 bg-white border border-gray-200 rounded-xl hover:border-teal-300 transition-colors">
                          <div className="flex items-start justify-between mb-4">
                            <h3 className="text-white font-semibold text-lg">{campaign.name}</h3>
                            <span className={`px-3 py-1 text-sm rounded-full ${
                              campaign.status === 'Active' ? 'bg-teal-100 text-teal-600' :
                              campaign.status === 'Scheduled' ? 'bg-teal-100 text-teal-600' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {campaign.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-gray-600 text-sm">Contacts</div>
                              <div className="text-white text-xl font-bold">{campaign.contacts}</div>
                            </div>
                            <div>
                              <div className="text-gray-600 text-sm">Sent</div>
                              <div className="text-white text-xl font-bold">{campaign.sent}</div>
                            </div>
                            <div>
                              <div className="text-gray-600 text-sm">Opened</div>
                              <div className="text-white text-xl font-bold">{campaign.opened}</div>
                            </div>
                            <div>
                              <div className="text-gray-600 text-sm">Replied</div>
                              <div className="text-white text-xl font-bold">{campaign.replied}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* WORKFLOWS TAB */}
                {demoTab === 'workflows' && (
                  <>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Workflows</h2>
                      <p className="text-gray-600">Automate conversations with AI</p>
                    </div>

                    <button className="mb-6 px-6 py-3 bg-teal-500 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors">
                      + Create AI Workflow
                    </button>

                    <div className="space-y-4">
                      {[
                        { name: 'New Lead Qualifier', trigger: 'New lead added', actions: 'Send welcome, Ask questions, Qualify', active: true, conversations: 1203 },
                        { name: 'Policy Renewal Assistant', trigger: 'Policy expiring soon', actions: 'Send reminder, Answer questions, Schedule call', active: true, conversations: 847 },
                        { name: 'Property Info Collector', trigger: 'Lead expresses interest', actions: 'Collect property details, Provide estimate', active: true, conversations: 623 },
                        { name: 'Appointment Scheduler', trigger: 'Lead ready to meet', actions: 'Find available times, Book appointment, Send confirmation', active: false, conversations: 234 },
                      ].map((workflow, i) => (
                        <div key={i} className="p-6 bg-white border border-gray-200 rounded-xl">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <h3 className="text-white font-semibold text-lg mb-1">{workflow.name}</h3>
                              <div className="text-gray-600 text-sm">
                                <span className="font-medium">Trigger:</span> {workflow.trigger}
                              </div>
                              <div className="text-gray-600 text-sm">
                                <span className="font-medium">Actions:</span> {workflow.actions}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-white text-2xl font-bold">{workflow.conversations}</div>
                                <div className="text-gray-600 text-sm">conversations</div>
                              </div>
                              <div className={`px-3 py-1 rounded-full text-sm ${
                                workflow.active ? 'bg-teal-100 text-teal-600' : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {workflow.active ? 'Active' : 'Inactive'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ANALYTICS TAB */}
                {demoTab === 'analytics' && (
                  <>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Analytics</h2>
                      <p className="text-gray-600">Track your performance metrics</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="p-6 bg-white border border-gray-200 rounded-xl">
                        <div className="text-gray-600 mb-2">Total Messages Sent</div>
                        <div className="text-3xl font-bold text-white">12,847</div>
                        <div className="text-teal-600 text-sm mt-2">↑ 34% from last month</div>
                      </div>
                      <div className="p-6 bg-white border border-gray-200 rounded-xl">
                        <div className="text-gray-600 mb-2">Average Response Rate</div>
                        <div className="text-3xl font-bold text-white">72.4%</div>
                        <div className="text-teal-600 text-sm mt-2">↑ 8.3% from last month</div>
                      </div>
                      <div className="p-6 bg-white border border-gray-200 rounded-xl">
                        <div className="text-gray-600 mb-2">Appointments Booked</div>
                        <div className="text-3xl font-bold text-white">234</div>
                        <div className="text-teal-600 text-sm mt-2">↑ 12% from last month</div>
                      </div>
                    </div>

                    <div className="p-6 bg-white border border-gray-200 rounded-xl">
                      <h3 className="text-white font-semibold text-lg mb-4">Message Volume (Last 7 Days)</h3>
                      <div className="h-64 flex items-end justify-between gap-2">
                        {[45, 62, 58, 73, 81, 95, 88].map((height, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center">
                            <div className="w-full bg-gradient-to-t from-teal-500 to-cyan-500 rounded-t" style={{ height: `${height}%` }}></div>
                            <div className="text-gray-600 text-sm mt-2">
                              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* TEMPLATES, PHONE, PLANS - Placeholder for now */}
                {(demoTab === 'templates' || demoTab === 'phone' || demoTab === 'plans') && (
                  <div className="text-center py-20">
                    <div className="text-gray-600 mb-4">
                      {demoTab === 'templates' && 'Message Templates'}
                      {demoTab === 'phone' && 'Phone Number Management'}
                      {demoTab === 'plans' && 'Plans & Billing'}
                    </div>
                    <p className="text-gray-400">This section is available in the full application</p>
                    <Link
                      href="/auth/register"
                      className="inline-block mt-6 px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold rounded-lg transition-all"
                    >
                      Sign Up to Access
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
