'use client';

import { useState } from 'react';
import { X, CreditCard, Zap, Phone, Loader2, Check, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PurchaseNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  onSuccess: () => void;
  userCredits: number;
}

type PaymentMethod = 'stripe' | 'credits';

const POINTS_PER_NUMBER = 100; // 100 credits/month for additional numbers

export default function PurchaseNumberModal({
  isOpen,
  onClose,
  phoneNumber,
  onSuccess,
  userCredits
}: PurchaseNumberModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('stripe');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEnoughCredits = userCredits >= POINTS_PER_NUMBER;

  const handlePurchase = async () => {
    if (selectedMethod === 'credits' && !hasEnoughCredits) {
      setError(`You need at least ${POINTS_PER_NUMBER} credits. You have ${userCredits}.`);
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      if (selectedMethod === 'stripe') {
        // Create Stripe subscription for the number
        const response = await fetch('/api/stripe/create-number-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber })
        });

        const data = await response.json();

        if (data.success) {
          onSuccess();
          onClose();
        } else if (data.url) {
          // Redirect to Stripe checkout
          window.location.href = data.url;
        } else {
          setError(data.error || 'Failed to create subscription');
        }
      } else {
        // Pay with credits
        const response = await fetch('/api/number-pool/purchase-with-credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber,
            credits: POINTS_PER_NUMBER
          })
        });

        const data = await response.json();

        if (data.success) {
          onSuccess();
          onClose();
        } else {
          setError(data.error || 'Failed to purchase with credits');
        }
      }
    } catch (err) {
      console.error('Purchase error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-sky-500 to-teal-500 p-6 text-white">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Add Phone Number</h2>
                  <p className="text-white/80 text-sm font-mono">{formatPhoneNumber(phoneNumber)}</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-300 mb-4 text-center">
                Choose how you'd like to pay for this additional number
              </p>

              <div className="space-y-3 mb-6">
                {/* Stripe Option */}
                <button
                  onClick={() => setSelectedMethod('stripe')}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMethod === 'stripe'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedMethod === 'stripe'
                          ? 'bg-sky-100 dark:bg-sky-900/50'
                          : 'bg-slate-100 dark:bg-slate-700'
                      }`}>
                        <CreditCard className={`w-5 h-5 ${
                          selectedMethod === 'stripe' ? 'text-sky-600' : 'text-slate-500'
                        }`} />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          Pay with Card
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          $1.00/month subscription
                        </div>
                      </div>
                    </div>
                    {selectedMethod === 'stripe' && (
                      <div className="w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                </button>

                {/* Credits Option */}
                <button
                  onClick={() => setSelectedMethod('credits')}
                  disabled={!hasEnoughCredits}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    selectedMethod === 'credits'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                      : !hasEnoughCredits
                      ? 'border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedMethod === 'credits'
                          ? 'bg-amber-100 dark:bg-amber-900/50'
                          : 'bg-slate-100 dark:bg-slate-700'
                      }`}>
                        <Zap className={`w-5 h-5 ${
                          selectedMethod === 'credits' ? 'text-amber-600' : 'text-slate-500'
                        }`} />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          Use Credits
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {POINTS_PER_NUMBER} credits/month
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {selectedMethod === 'credits' ? (
                        <div className="w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Balance: {userCredits.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  {!hasEnoughCredits && (
                    <p className="mt-2 text-xs text-red-500">
                      Not enough credits. Need {POINTS_PER_NUMBER}, have {userCredits}.
                    </p>
                  )}
                </button>
              </div>

              {/* Summary */}
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Monthly cost:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {selectedMethod === 'stripe' ? '$1.00' : `${POINTS_PER_NUMBER} credits`}
                  </span>
                </div>
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center mb-4">{error}</p>
              )}

              <button
                onClick={handlePurchase}
                disabled={processing || (selectedMethod === 'credits' && !hasEnoughCredits)}
                className="w-full py-3 bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/25 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {selectedMethod === 'stripe' ? (
                      <>
                        <DollarSign className="w-5 h-5" />
                        Continue to Payment
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        Purchase with Credits
                      </>
                    )}
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
                You can cancel anytime from Settings
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
