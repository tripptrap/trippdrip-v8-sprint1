"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { SUBSCRIPTION_FEATURES } from "@/lib/subscriptionFeatures";

export default function PreviewClient() {
  const [selectedPlan, setSelectedPlan] = useState<string>('basic');
  const [showDemo, setShowDemo] = useState(false);

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
        <nav className="relative z-10 flex items-center justify-between p-4 sm:p-6 max-w-7xl mx-auto gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-xs sm:text-sm">HW</span>
            </div>
            <span className="text-lg sm:text-2xl font-bold text-white whitespace-nowrap">HyveWyre™</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/auth/login"
                className="px-3 py-2 sm:px-4 text-sm sm:text-base text-white/80 hover:text-white transition-colors whitespace-nowrap inline-block"
              >
                Sign In
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/auth/register"
                className="px-4 py-2 sm:px-6 text-sm sm:text-base bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg transition-all whitespace-nowrap inline-block"
              >
                Get Started
              </Link>
            </motion.div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full text-blue-400 text-sm font-medium"
          >
            AI-Powered SMS & Email Marketing
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-5xl md:text-7xl font-bold text-white mb-6"
          >
            AI-Powered SMS Marketing for Insurance & Real Estate Agents<br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Automate Conversations, Close More Deals
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-xl text-white/60 mb-8 max-w-3xl mx-auto"
          >
            Automate personalized conversations, nurture leads with AI, and close more deals with intelligent SMS and email campaigns.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-col items-center justify-center gap-4"
          >
            <div className="flex items-center justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(59, 130, 246, 0.3)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg shadow-blue-500/20"
              >
                View Pricing
              </motion.button>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  href="/auth/register"
                  className="inline-block px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-all border border-white/10"
                >
                  Create Account
                </Link>
              </motion.div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 15px 30px rgba(16, 185, 129, 0.25)" }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowDemo(true)}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-emerald-500/20"
            >
              View Demo
            </motion.button>
          </motion.div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-white text-center mb-12"
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
              boxShadow: "0px 15px 40px rgba(59, 130, 246, 0.25)",
            }}
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all hover:border-blue-500/50"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">AI-Powered Responses</h3>
            <p className="text-white/60">
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
              boxShadow: "0px 15px 40px rgba(168, 85, 247, 0.25)",
            }}
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all hover:border-purple-500/50"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Bulk Campaigns</h3>
            <p className="text-white/60">
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
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all hover:border-green-500/50"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Advanced Analytics</h3>
            <p className="text-white/60">
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
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all hover:border-orange-500/50"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Smart Automation</h3>
            <p className="text-white/60">
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
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all hover:border-pink-500/50"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Workflow Management</h3>
            <p className="text-white/60">
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
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all hover:border-cyan-500/50"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">TCPA Compliant</h3>
            <p className="text-white/60">
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
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Why Choose HyveWyre™?
          </h2>
          <p className="text-xl text-white/60 max-w-3xl mx-auto">
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
              <tr className="border-b border-white/20">
                <th className="text-left p-4 text-white/60 font-medium">Feature</th>
                <th className="p-4 text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-400 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-xs">HW</span>
                    </div>
                    <span className="text-white font-bold">HyveWyre™</span>
                  </div>
                </th>
                <th className="p-4 text-center text-white/60 font-medium">Competitor A</th>
                <th className="p-4 text-center text-white/60 font-medium">Competitor B</th>
                <th className="p-4 text-center text-white/60 font-medium">Competitor C</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">AI-Powered Responses</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
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

              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">SMS + Email Combined</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-red-500/20 rounded-full">
                    <span className="text-red-400 text-sm">SMS Only</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">Instant Number Access</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
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

              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">Built-in CRM</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-500/20 rounded-full">
                    <span className="text-yellow-400 text-sm">Basic</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">Sentiment Analysis</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
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

              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">Smart Auto-Replies</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
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

              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">Drag & Drop Campaigns</td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
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
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-full">
                    <span className="text-green-400 text-xl">✓</span>
                  </span>
                </td>
              </tr>

              <tr className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">Starting Price</td>
                <td className="p-4 text-center">
                  <span className="text-green-400 font-bold">$30/mo</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-white/60">$25-$100/mo</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-white/60">$109/mo</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-white/60">$29-$259/mo</span>
                </td>
              </tr>

              <tr className="hover:bg-white/5 transition-colors">
                <td className="p-4 text-white">Setup Time</td>
                <td className="p-4 text-center">
                  <span className="text-green-400 font-bold">5 minutes</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-white/60">1-2 hours</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-white/60">30-45 minutes</span>
                </td>
                <td className="p-4 text-center">
                  <span className="text-white/60">1 hour</span>
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
              boxShadow: "0px 15px 40px rgba(59, 130, 246, 0.3)",
            }}
            className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl hover:border-blue-500/50 transition-all"
          >
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Start Messaging Instantly</h3>
            <p className="text-white/70">
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
              boxShadow: "0px 15px 40px rgba(168, 85, 247, 0.3)",
            }}
            className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl hover:border-purple-500/50 transition-all"
          >
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">True AI Intelligence</h3>
            <p className="text-white/70">
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
            className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl hover:border-green-500/50 transition-all"
          >
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">All-in-One Platform</h3>
            <p className="text-white/70">
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
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-white/60">
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
              boxShadow: "0px 20px 45px rgba(59, 130, 246, 0.35)",
            }}
            className="p-8 bg-white/5 border-2 border-white/10 rounded-2xl hover:border-blue-500/50 transition-all"
          >
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
                <span className="text-white">Priority email support</span>
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/auth/register?plan=starter"
                className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-center transition-all"
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
              boxShadow: "0px 20px 45px rgba(168, 85, 247, 0.4)",
            }}
            className="relative p-8 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-2 border-purple-500 rounded-2xl"
          >
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
                <span className="text-white">Dedicated account manager</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-xl">✓</span>
                <span className="text-white">Priority support</span>
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/auth/register?plan=professional"
                className="block w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg text-center transition-all"
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
          <p className="text-white/60">
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
          className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-8 md:p-12 text-center"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Outreach?
          </h2>
          <p className="text-xl text-white/60 mb-8 max-w-2xl mx-auto">
            Join thousands of businesses already using HyveWyre™ to engage, nurture, and convert more leads.
          </p>
          <motion.div whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(59, 130, 246, 0.4)" }} whileTap={{ scale: 0.95 }}>
            <Link
              href="/auth/register"
              className="inline-block px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg shadow-blue-500/20"
            >
              Get Started Now
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">HW</span>
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
            className="w-full max-w-7xl h-[90vh] bg-gradient-to-br from-[#0f1419] via-[#1a1f2e] to-[#0f1419] rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Demo Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xs">HW</span>
                </div>
                <span className="text-white font-semibold">HyveWyre™ Demo</span>
              </div>
              <button
                onClick={() => setShowDemo(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Demo Content */}
            <div className="flex h-[calc(100%-64px)]" onClick={(e) => e.stopPropagation()}>
              {/* Sidebar */}
              <div className="w-64 bg-white/5 border-r border-white/10 p-4">
                <div className="space-y-2">
                  <button className="w-full px-4 py-3 bg-blue-500/20 border border-blue-500/30 rounded-lg text-white font-medium text-left">
                    Dashboard
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left">
                    Leads (247)
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left">
                    Messages (12)
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left">
                    Campaigns (8)
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left">
                    AI Workflows (5)
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left">
                    Analytics
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left">
                    Templates (23)
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left">
                    Phone Numbers
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="w-full px-4 py-3 bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/40 rounded-lg text-orange-300 font-medium hover:from-orange-500/30 hover:to-amber-500/30 transition-all text-left">
                    Plans & Billing
                  </button>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 p-6 overflow-y-auto pointer-events-auto">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">Dashboard Overview</h2>
                  <p className="text-white/60">Welcome back, Sarah - Here's your performance for March 2025</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-blue-500/30 transition-colors">
                    <div className="text-white/60 text-sm mb-1">Total Leads</div>
                    <div className="text-2xl font-bold text-white">1,847</div>
                    <div className="text-green-400 text-sm mt-1">↑ 23% from last month</div>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-blue-500/30 transition-colors">
                    <div className="text-white/60 text-sm mb-1">Active Campaigns</div>
                    <div className="text-2xl font-bold text-white">12</div>
                    <div className="text-blue-400 text-sm mt-1">5 scheduled, 7 running</div>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-blue-500/30 transition-colors">
                    <div className="text-white/60 text-sm mb-1">Response Rate</div>
                    <div className="text-2xl font-bold text-white">72.4%</div>
                    <div className="text-green-400 text-sm mt-1">↑ 8.3% from last week</div>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-blue-500/30 transition-colors">
                    <div className="text-white/60 text-sm mb-1">AI Conversations</div>
                    <div className="text-2xl font-bold text-white">1,203</div>
                    <div className="text-purple-400 text-sm mt-1">94.7% automation</div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-all text-left cursor-pointer">
                    <div className="text-blue-400 font-semibold">Send Campaign</div>
                    <div className="text-white/60 text-sm mt-1">Start new outreach</div>
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-all text-left cursor-pointer">
                    <div className="text-purple-400 font-semibold">Add Lead</div>
                    <div className="text-white/60 text-sm mt-1">Import or create</div>
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-all text-left cursor-pointer">
                    <div className="text-green-400 font-semibold">AI Workflow</div>
                    <div className="text-white/60 text-sm mt-1">Setup automation</div>
                  </button>
                  <button onClick={(e) => e.preventDefault()} className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-all text-left cursor-pointer">
                    <div className="text-orange-400 font-semibold">View Analytics</div>
                    <div className="text-white/60 text-sm mt-1">Deep dive stats</div>
                  </button>
                </div>

                {/* Active Campaigns */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                  <h3 className="text-lg font-bold text-white mb-4">Active Campaigns</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium">Spring Home Insurance Follow-up</div>
                          <div className="text-white/60 text-sm">847 contacts • 68.2% open rate</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">Active</span>
                        <button className="text-white/60 hover:text-white">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium">New Property Listing Alerts</div>
                          <div className="text-white/60 text-sm">1,203 contacts • 72.8% response rate</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">Active</span>
                        <button className="text-white/60 hover:text-white">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                          <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium">Policy Renewal Reminders</div>
                          <div className="text-white/60 text-sm">Scheduled for Apr 1 • 523 contacts</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full">Scheduled</span>
                        <button className="text-white/60 hover:text-white">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">New lead: Michael Chen</div>
                        <div className="text-white/60 text-sm">Interested in home insurance • AI workflow started</div>
                      </div>
                      <div className="text-white/40 text-sm">3 min ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                      <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">Campaign: Spring Home Insurance delivered</div>
                        <div className="text-white/60 text-sm">847 messages sent • 576 delivered • 68.2% opened</div>
                      </div>
                      <div className="text-white/40 text-sm">18 min ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                      <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">AI responded to Jennifer Martinez</div>
                        <div className="text-white/60 text-sm">Answered question about coverage options</div>
                      </div>
                      <div className="text-white/40 text-sm">42 min ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                      <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">Lead qualification alert</div>
                        <div className="text-white/60 text-sm">David Thompson marked as hot lead - ready for call</div>
                      </div>
                      <div className="text-white/40 text-sm">1 hour ago</div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                      <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">Weekly report generated</div>
                        <div className="text-white/60 text-sm">247 new leads, 72.4% response rate, $45.2K pipeline</div>
                      </div>
                      <div className="text-white/40 text-sm">2 hours ago</div>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-6 p-6 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-xl text-center">
                  <h3 className="text-xl font-bold text-white mb-2">Ready to get started?</h3>
                  <p className="text-white/60 mb-4">Sign up now to access all features and start automating your conversations</p>
                  <Link
                    href="/auth/register"
                    className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all"
                  >
                    Create Free Account
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
