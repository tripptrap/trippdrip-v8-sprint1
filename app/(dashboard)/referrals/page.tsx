'use client';

import { useEffect, useState } from 'react';
import { Gift, Users, Calendar, Copy, Check, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

type ReferralStats = {
  referralCode: string | null;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  activeRewards: number;
  totalDaysEarned: number;
};

type Referral = {
  id: string;
  referred_user_id: string;
  status: 'pending' | 'completed' | 'rewarded';
  created_at: string;
  completed_at: string | null;
  reward_granted_at: string | null;
};

type Reward = {
  id: string;
  reward_type: string;
  reward_value: number;
  granted_at: string;
  expires_at: string;
  is_active: boolean;
};

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [copied, setCopied] = useState(false);
  const [applyingCode, setApplyingCode] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState('');

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    try {
      setLoading(true);

      // Get referral stats
      const statsRes = await fetch('/api/referrals/stats');
      const statsData = await statsRes.json();

      if (statsData.ok) {
        setStats(statsData.stats);
        setReferrals(statsData.referrals);
        setRewards(statsData.rewards);
      }

    } catch (error: any) {
      console.error('Error loading referral data:', error);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (stats?.referralCode) {
      const referralUrl = `${window.location.origin}/signup?ref=${stats.referralCode}`;
      navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      toast.success('Referral link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApplyCode = async () => {
    if (!referralCodeInput.trim()) {
      toast.error('Please enter a referral code');
      return;
    }

    try {
      setApplyingCode(true);

      const response = await fetch('/api/referrals/apply-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: referralCodeInput.trim() })
      });

      const data = await response.json();

      if (data.ok) {
        toast.success('Referral code applied successfully!');
        setReferralCodeInput('');
        loadReferralData();
      } else {
        toast.error(data.error || 'Failed to apply referral code');
      }

    } catch (error: any) {
      console.error('Error applying referral code:', error);
      toast.error('Failed to apply referral code');
    } finally {
      setApplyingCode(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#9fb0c3]">Loading referral program...</div>
      </div>
    );
  }

  const referralUrl = stats?.referralCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?ref=${stats.referralCode}`
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#e7eef9]">Referral Program</h1>
        <p className="text-[#9fb0c3] mt-1">
          Earn 1 month of free premium for each successful referral
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Referrals */}
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[#9fb0c3] mb-1">Total Referrals</p>
              <p className="text-3xl font-bold text-[#e7eef9]">{stats?.totalReferrals || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-blue-900/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-400" />
            </div>
          </div>
        </div>

        {/* Successful Referrals */}
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[#9fb0c3] mb-1">Successful Referrals</p>
              <p className="text-3xl font-bold text-green-400">{stats?.successfulReferrals || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-green-900/20 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-400" />
            </div>
          </div>
        </div>

        {/* Total Days Earned */}
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[#9fb0c3] mb-1">Premium Days Earned</p>
              <p className="text-3xl font-bold text-purple-400">{stats?.totalDaysEarned || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-purple-900/20 flex items-center justify-center">
              <Gift className="h-6 w-6 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Your Referral Code */}
      <div className="card bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-700/50">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Gift className="h-6 w-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">Your Referral Link</h3>
            <p className="text-[#9fb0c3] mb-4">
              Share this link with friends. When they sign up and make their first purchase, you'll both get 1 month of free premium!
            </p>

            <div className="flex gap-2 mb-4">
              <div className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-lg font-mono text-sm text-[#e7eef9] break-all">
                {referralUrl}
              </div>
              <button
                onClick={handleCopyCode}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="px-3 py-1 bg-blue-900/30 border border-blue-700 text-blue-400 rounded-full font-medium">
                Your Code: {stats?.referralCode}
              </span>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out HyveWyre! Use my referral link to get 1 month free premium: ${referralUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-sky-900/30 border border-sky-700 text-sky-400 rounded-full font-medium hover:bg-sky-900/50 transition-colors inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Share on Twitter
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Apply Referral Code */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-green-900/20 flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">Have a Referral Code?</h3>
            <p className="text-[#9fb0c3] mb-4">
              Enter a referral code from a friend to get 1 month of free premium when you make your first purchase.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={referralCodeInput}
                onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter referral code"
                className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[#e7eef9] placeholder-[#9fb0c3]/50"
                maxLength={20}
              />
              <button
                onClick={handleApplyCode}
                disabled={applyingCode || !referralCodeInput.trim()}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {applyingCode ? 'Applying...' : 'Apply Code'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* How it Works */}
      <div className="card bg-purple-900/20 border-purple-700/50">
        <h3 className="text-lg font-semibold text-[#e7eef9] mb-4">How the Referral Program Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="w-10 h-10 rounded-lg bg-purple-900/30 flex items-center justify-center mb-3">
              <span className="text-xl font-bold text-purple-400">1</span>
            </div>
            <h4 className="font-medium text-[#e7eef9] mb-2">Share Your Link</h4>
            <p className="text-sm text-[#9fb0c3]">
              Copy your unique referral link and share it with friends, colleagues, or on social media.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-purple-900/30 flex items-center justify-center mb-3">
              <span className="text-xl font-bold text-purple-400">2</span>
            </div>
            <h4 className="font-medium text-[#e7eef9] mb-2">They Sign Up</h4>
            <p className="text-sm text-[#9fb0c3]">
              When someone signs up using your link and makes their first purchase, they get 1 month free premium too!
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-purple-900/30 flex items-center justify-center mb-3">
              <span className="text-xl font-bold text-purple-400">3</span>
            </div>
            <h4 className="font-medium text-[#e7eef9] mb-2">Get Your Reward</h4>
            <p className="text-sm text-[#9fb0c3]">
              You receive 1 month of free premium access for each successful referral. Rewards stack!
            </p>
          </div>
        </div>
      </div>

      {/* Active Rewards */}
      {rewards.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-[#e7eef9] mb-4">Active Rewards</h3>
          <div className="space-y-3">
            {rewards.map((reward) => (
              <div
                key={reward.id}
                className="flex items-center justify-between p-4 bg-green-900/10 border border-green-700/30 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center">
                    <Gift className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-[#e7eef9]">
                      {reward.reward_value} Days Premium
                    </p>
                    <p className="text-sm text-[#9fb0c3]">
                      Granted {new Date(reward.granted_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[#9fb0c3]">Expires</p>
                  <p className="font-medium text-[#e7eef9]">
                    {new Date(reward.expires_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Referrals */}
      {referrals.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-[#e7eef9] mb-4">Your Referrals</h3>
          <div className="space-y-2">
            {referrals.map((referral, index) => (
              <div
                key={referral.id}
                className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-900/30 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-[#e7eef9]">Referral #{index + 1}</p>
                    <p className="text-sm text-[#9fb0c3]">
                      {new Date(referral.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      referral.status === 'rewarded'
                        ? 'bg-green-900/30 border border-green-700 text-green-400'
                        : referral.status === 'completed'
                        ? 'bg-blue-900/30 border border-blue-700 text-blue-400'
                        : 'bg-yellow-900/30 border border-yellow-700 text-yellow-400'
                    }`}
                  >
                    {referral.status === 'rewarded'
                      ? '✓ Rewarded'
                      : referral.status === 'completed'
                      ? 'Completed'
                      : 'Pending'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
