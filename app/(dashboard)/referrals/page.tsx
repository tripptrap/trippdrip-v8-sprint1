'use client';

import { Gift, Users, Lock } from 'lucide-react';

export default function ReferralsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#e7eef9]">Referral Program</h1>
        <p className="text-[#9fb0c3] mt-1">
          Earn 1 month of free premium for each successful referral
        </p>
      </div>

      {/* Coming Soon Banner */}
      <div className="card bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-700/50">
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-purple-900/30 flex items-center justify-center mb-6">
            <Lock className="h-10 w-10 text-purple-400" />
          </div>
          <h2 className="text-3xl font-bold text-[#e7eef9] mb-3">Coming Soon!</h2>
          <p className="text-lg text-[#9fb0c3] mb-6 max-w-2xl">
            Our referral program is currently under development. Soon you'll be able to earn 1 month of free premium for each friend you refer to HyveWyre.
          </p>
          <div className="flex items-center gap-2 text-sm text-purple-400">
            <Gift className="h-5 w-5" />
            <span className="font-medium">Get rewarded for spreading the word</span>
          </div>
        </div>
      </div>

      {/* Preview: How it Will Work */}
      <div className="card bg-blue-900/10 border-blue-700/30">
        <h3 className="text-lg font-semibold text-[#e7eef9] mb-4">How It Will Work</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center mb-3">
              <span className="text-xl font-bold text-blue-400">1</span>
            </div>
            <h4 className="font-medium text-[#e7eef9] mb-2">Share Your Link</h4>
            <p className="text-sm text-[#9fb0c3]">
              Copy your unique referral link and share it with friends, colleagues, or on social media.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center mb-3">
              <span className="text-xl font-bold text-blue-400">2</span>
            </div>
            <h4 className="font-medium text-[#e7eef9] mb-2">They Sign Up</h4>
            <p className="text-sm text-[#9fb0c3]">
              When someone signs up using your link and makes their first purchase, they get 1 month free premium too!
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center mb-3">
              <span className="text-xl font-bold text-blue-400">3</span>
            </div>
            <h4 className="font-medium text-[#e7eef9] mb-2">Get Your Reward</h4>
            <p className="text-sm text-[#9fb0c3]">
              You receive 1 month of free premium access for each successful referral. Rewards stack!
            </p>
          </div>
        </div>
      </div>

      {/* Stay Tuned */}
      <div className="card bg-green-900/10 border-green-700/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">Stay Tuned</h3>
            <p className="text-[#9fb0c3]">
              We're working hard to bring you an amazing referral program. Check back soon or contact us for updates on the launch date.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
