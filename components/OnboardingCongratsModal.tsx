'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper, Check, Phone, CreditCard, Zap, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const PHONE_SELECTED_KEY = 'onboarding_phone_selected';
const THEME_SELECTED_KEY = 'theme_selection_shown';
const TOUR_COMPLETED_KEY = 'onboarding_tour_completed';

interface UserInfo {
  plan: string | null;
  credits: number;
  hasNumber: boolean;
}

export default function OnboardingCongratsModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    // Check if all previous steps are complete and this hasn't been shown
    const checkAndShow = () => {
      const phoneComplete = localStorage.getItem(PHONE_SELECTED_KEY);
      const themeComplete = localStorage.getItem(THEME_SELECTED_KEY);
      const tourComplete = localStorage.getItem(TOUR_COMPLETED_KEY);
      const alreadyShown = localStorage.getItem(ONBOARDING_COMPLETED_KEY);

      // Only show if:
      // 1. Phone selection is done (selected or skipped)
      // 2. Theme selection is done
      // 3. Tour is complete
      // 4. This modal hasn't been shown yet
      if (phoneComplete && themeComplete && tourComplete && !alreadyShown) {
        fetchUserInfo();
      }
    };

    // Check on mount and set up interval to check for tour completion
    const interval = setInterval(checkAndShow, 1000);
    checkAndShow();

    return () => clearInterval(interval);
  }, []);

  const fetchUserInfo = async () => {
    try {
      // Fetch user's current subscription and number info
      const [userResponse, numbersResponse] = await Promise.all([
        fetch('/api/user/profile'),
        fetch('/api/telnyx/numbers')
      ]);

      const userData = await userResponse.json();
      const numbersData = await numbersResponse.json();

      setUserInfo({
        plan: userData.subscription_tier || null,
        credits: userData.credits || 0,
        hasNumber: (numbersData.numbers?.length || 0) > 0
      });

      setIsOpen(true);
    } catch (err) {
      console.error('Error fetching user info:', err);
      // Show modal anyway with defaults
      setUserInfo({
        plan: null,
        credits: 0,
        hasNumber: false
      });
      setIsOpen(true);
    }
  };

  const handleGetStarted = () => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    setIsOpen(false);
  };

  const getPlanName = (tier: string | null | undefined) => {
    if (tier === 'premium') return 'Premium';
    if (tier === 'basic') return 'Basic';
    return 'Free';
  };

  const getPlanCredits = (tier: string | null | undefined) => {
    if (tier === 'premium') return '10,000';
    if (tier === 'basic') return '3,000';
    return '0';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
          >
            {/* Header with confetti effect */}
            <div className="relative bg-gradient-to-r from-sky-500 to-teal-500 p-10 text-white text-center overflow-hidden">
              {/* Animated confetti dots */}
              <div className="absolute inset-0 overflow-hidden">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      y: -20,
                      x: Math.random() * 100 + '%',
                      opacity: 0,
                      scale: 0
                    }}
                    animate={{
                      y: '100%',
                      opacity: [0, 1, 1, 0],
                      scale: [0, 1, 1, 0.5]
                    }}
                    transition={{
                      duration: 3,
                      delay: Math.random() * 2,
                      repeat: Infinity,
                      repeatDelay: Math.random() * 3
                    }}
                    className={`absolute w-2 h-2 rounded-full ${
                      i % 3 === 0 ? 'bg-yellow-300' : i % 3 === 1 ? 'bg-pink-300' : 'bg-white'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleGetStarted}
                className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.2 }}
                className="relative z-10"
              >
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <PartyPopper className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Congratulations!</h2>
                <p className="text-white/90">Thank you for joining HyveWyre</p>
              </motion.div>
            </div>

            {/* Body - What you got */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">
                Here's What You Got
              </h3>

              <div className="space-y-3">
                {/* Plan */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
                >
                  <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/30 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {getPlanName(userInfo?.plan)} Plan
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Your subscription is active
                    </div>
                  </div>
                  <Check className="w-5 h-5 text-green-500" />
                </motion.div>

                {/* Credits */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
                >
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {userInfo?.credits?.toLocaleString() || getPlanCredits(userInfo?.plan)} Credits
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Ready to send messages
                    </div>
                  </div>
                  <Check className="w-5 h-5 text-green-500" />
                </motion.div>

                {/* Phone Number */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
                >
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {userInfo?.hasNumber ? 'Phone Number' : 'No Number Yet'}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {userInfo?.hasNumber
                        ? 'Ready to send & receive'
                        : 'Select a toll-free number to get started'}
                    </div>
                  </div>
                  {userInfo?.hasNumber ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-full">
                      Recommended
                    </span>
                  )}
                </motion.div>
              </div>

              {/* CTA Buttons */}
              <div className="mt-6 space-y-3">
                {!userInfo?.hasNumber && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    onClick={() => {
                      localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
                      setIsOpen(false);
                      router.push('/phone-numbers');
                    }}
                    className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2"
                  >
                    <Phone className="w-5 h-5" />
                    Select a Number
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                )}

                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: userInfo?.hasNumber ? 0.6 : 0.7 }}
                  onClick={handleGetStarted}
                  className={`w-full py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    !userInfo?.hasNumber
                      ? 'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      : 'bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 text-white shadow-lg shadow-sky-500/25'
                  }`}
                >
                  {userInfo?.hasNumber ? 'Get Started' : 'Skip for Now'}
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </div>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
                {!userInfo?.hasNumber
                  ? 'A toll-free number lets you send & receive SMS'
                  : 'Need help? Check out our guides in the sidebar'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
