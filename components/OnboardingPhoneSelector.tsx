'use client';

import { useState, useEffect } from 'react';
import { Phone, Loader2, X, CheckCircle, MapPin, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PHONE_SELECTED_KEY = 'onboarding_phone_selected';

interface PoolNumber {
  id: string;
  phone_number: string;
  friendly_name: string | null;
  number_type: string;
  area_code: string | null;
  region: string | null;
  capabilities: {
    sms?: boolean;
    mms?: boolean;
    voice?: boolean;
  } | null;
}

export default function OnboardingPhoneSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [numbers, setNumbers] = useState<PoolNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<PoolNumber | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if user has already completed phone selection
    const hasSelected = localStorage.getItem(PHONE_SELECTED_KEY);
    if (!hasSelected) {
      // Check if user is a new subscriber (just completed Stripe checkout)
      // We show this modal after a brief delay
      const timer = setTimeout(() => {
        checkAndShowModal();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const checkAndShowModal = async () => {
    try {
      // Check if user already has a number assigned
      const response = await fetch('/api/telnyx/numbers');
      const data = await response.json();

      if (data.numbers && data.numbers.length > 0) {
        // User already has numbers, mark as complete
        localStorage.setItem(PHONE_SELECTED_KEY, 'true');
        return;
      }

      // User has no numbers, show the modal
      setIsOpen(true);
      fetchAvailableNumbers();
    } catch (err) {
      console.error('Error checking user numbers:', err);
      // On error, still try to show the modal
      setIsOpen(true);
      fetchAvailableNumbers();
    }
  };

  const fetchAvailableNumbers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/number-pool/available');
      const data = await response.json();

      if (data.success) {
        setNumbers(data.numbers || []);
      } else {
        setError('Failed to load available numbers');
      }
    } catch (err) {
      console.error('Error fetching numbers:', err);
      setError('Failed to load available numbers');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimNumber = async () => {
    if (!selectedNumber) return;

    try {
      setClaiming(true);
      setError(null);

      const response = await fetch('/api/number-pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberId: selectedNumber.id })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        localStorage.setItem(PHONE_SELECTED_KEY, 'true');
        // Close after showing success
        setTimeout(() => {
          setIsOpen(false);
        }, 2000);
      } else {
        setError(data.error || 'Failed to claim number');
      }
    } catch (err) {
      console.error('Error claiming number:', err);
      setError('Failed to claim number. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(PHONE_SELECTED_KEY, 'skipped');
    setIsOpen(false);
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
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-sky-500 to-teal-500 p-6 text-white flex-shrink-0">
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Choose Your Phone Number</h2>
                  <p className="text-white/80 text-sm">Pick a free number to get started</p>
                </div>
              </div>
            </div>

            {/* Success State */}
            {success ? (
              <div className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                  className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </motion.div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Number Claimed!
                </h3>
                <p className="text-slate-600 dark:text-slate-300">
                  {formatPhoneNumber(selectedNumber?.phone_number || '')} is now yours
                </p>
              </div>
            ) : (
              <>
                {/* Body */}
                <div className="p-6 flex-1 overflow-y-auto">
                  <p className="text-slate-600 dark:text-slate-300 mb-4 text-center">
                    Select a number from the list below. This number will be exclusively yours for sending messages.
                  </p>

                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                    </div>
                  ) : error && numbers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-red-500 mb-4">{error}</p>
                      <button
                        onClick={fetchAvailableNumbers}
                        className="text-sky-500 hover:text-sky-600 text-sm font-medium"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : numbers.length === 0 ? (
                    <div className="text-center py-8">
                      <Phone className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400 mb-2">
                        No numbers available right now
                      </p>
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        You can add a number later from Phone Numbers settings
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {numbers.map((number) => (
                        <button
                          key={number.id}
                          onClick={() => setSelectedNumber(number)}
                          className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                            selectedNumber?.id === number.id
                              ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                              : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {formatPhoneNumber(number.phone_number)}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {number.region && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {number.region}
                                  </span>
                                )}
                                <span className="capitalize">
                                  {number.number_type || 'Local'}
                                </span>
                              </div>
                            </div>
                            {selectedNumber?.id === number.id && (
                              <div className="w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {error && numbers.length > 0 && (
                    <p className="text-red-500 text-sm text-center mt-4">{error}</p>
                  )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <button
                    onClick={handleClaimNumber}
                    disabled={!selectedNumber || claiming}
                    className="w-full py-3 bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/25 disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    {claiming ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Claiming...
                      </>
                    ) : (
                      <>
                        Claim This Number
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSkip}
                    className="w-full mt-3 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-sm font-medium transition-colors"
                  >
                    Skip for now - I'll pick later
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
