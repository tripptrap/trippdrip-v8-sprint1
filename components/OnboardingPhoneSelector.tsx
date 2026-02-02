'use client';

import { useState, useEffect } from 'react';
import { Phone, Loader2, X, CheckCircle, MapPin, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboarding } from '@/lib/OnboardingContext';

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

interface TelnyxNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  numberType: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  monthlyPrice: string | null;
  upfrontPrice: string | null;
  reservable: boolean;
}

type NumberSource = 'pool' | 'telnyx';

export default function OnboardingPhoneSelector() {
  const { state, loading: stateLoading, updateState } = useOnboarding();
  const [isOpen, setIsOpen] = useState(false);
  const [poolNumbers, setPoolNumbers] = useState<PoolNumber[]>([]);
  const [telnyxNumbers, setTelnyxNumbers] = useState<TelnyxNumber[]>([]);
  const [numberSource, setNumberSource] = useState<NumberSource>('pool');
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [selectedPoolNumber, setSelectedPoolNumber] = useState<PoolNumber | null>(null);
  const [selectedTelnyxNumber, setSelectedTelnyxNumber] = useState<TelnyxNumber | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [claimedNumber, setClaimedNumber] = useState<string>('');

  useEffect(() => {
    if (stateLoading) return;
    if (!state.phone_selected) {
      const timer = setTimeout(() => {
        checkAndShowModal();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [stateLoading, state.phone_selected]);

  const checkAndShowModal = async () => {
    try {
      const response = await fetch('/api/telnyx/numbers');
      const data = await response.json();

      if (data.numbers && data.numbers.length > 0) {
        await updateState({ phone_selected: true });
        return;
      }

      setIsOpen(true);
      fetchAvailableNumbers();
    } catch (err) {
      console.error('Error checking user numbers:', err);
      setIsOpen(true);
      fetchAvailableNumbers();
    }
  };

  const fetchAvailableNumbers = async () => {
    try {
      setLoading(true);
      setError(null);

      const poolResponse = await fetch('/api/number-pool/available');
      const poolData = await poolResponse.json();

      if (poolData.success && poolData.numbers && poolData.numbers.length > 0) {
        setPoolNumbers(poolData.numbers);
        setNumberSource('pool');
        setLoading(false);
        return;
      }

      const telnyxResponse = await fetch('/api/telnyx/search-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tollFree: true,
          countryCode: 'US',
          limit: 10,
        }),
      });
      const telnyxData = await telnyxResponse.json();

      if (telnyxData.success && telnyxData.numbers && telnyxData.numbers.length > 0) {
        setTelnyxNumbers(telnyxData.numbers);
        setNumberSource('telnyx');
      } else {
        setError('No toll-free numbers available right now. Please try again later.');
      }
    } catch (err) {
      console.error('Error fetching numbers:', err);
      setError('Failed to load available numbers');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimNumber = async () => {
    if (numberSource === 'pool' && selectedPoolNumber) {
      await claimPoolNumber();
    } else if (numberSource === 'telnyx' && selectedTelnyxNumber) {
      await purchaseTelnyxNumber();
    }
  };

  const claimPoolNumber = async () => {
    if (!selectedPoolNumber) return;
    try {
      setClaiming(true);
      setError(null);

      const response = await fetch('/api/number-pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberId: selectedPoolNumber.id }),
      });

      const data = await response.json();

      if (data.success) {
        setClaimedNumber(selectedPoolNumber.phone_number);
        setSuccess(true);
        await updateState({ phone_selected: true });
        setTimeout(() => {
          setIsOpen(false);
          window.location.reload();
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

  const purchaseTelnyxNumber = async () => {
    if (!selectedTelnyxNumber) return;
    try {
      setClaiming(true);
      setError(null);

      const response = await fetch('/api/telnyx/purchase-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: selectedTelnyxNumber.phoneNumber }),
      });

      const data = await response.json();

      if (data.success) {
        setClaimedNumber(selectedTelnyxNumber.phoneNumber);
        setSuccess(true);
        await updateState({ phone_selected: true });
        setTimeout(() => {
          setIsOpen(false);
          window.location.reload();
        }, 2000);
      } else {
        setError(data.error || 'Failed to claim number');
      }
    } catch (err) {
      console.error('Error purchasing number:', err);
      setError('Failed to claim number. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const handleSkip = async () => {
    await updateState({ phone_selected: true });
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

  const hasNumbers = numberSource === 'pool' ? poolNumbers.length > 0 : telnyxNumbers.length > 0;
  const hasSelection = numberSource === 'pool' ? !!selectedPoolNumber : !!selectedTelnyxNumber;

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
            <div className="relative bg-gradient-to-r from-teal-500 to-cyan-500 p-6 text-white flex-shrink-0">
              <button onClick={handleSkip} className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Choose Your Phone Number</h2>
                  <p className="text-white/80 text-sm">Pick a toll-free number to get started</p>
                </div>
              </div>
            </div>

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
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Number Claimed!</h3>
                <p className="text-slate-600 dark:text-slate-300">{formatPhoneNumber(claimedNumber)} is now yours</p>
              </div>
            ) : (
              <>
                <div className="p-6 flex-1 overflow-y-auto">
                  <p className="text-slate-600 dark:text-slate-300 mb-4 text-center">
                    Select a toll-free number from the list below. This number will be exclusively yours for sending messages.
                  </p>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-3" />
                      <p className="text-sm text-slate-400">Searching for available numbers...</p>
                    </div>
                  ) : error && !hasNumbers ? (
                    <div className="text-center py-8">
                      <p className="text-red-500 mb-4">{error}</p>
                      <button onClick={fetchAvailableNumbers} className="text-teal-500 hover:text-teal-600 text-sm font-medium">Try Again</button>
                    </div>
                  ) : !hasNumbers ? (
                    <div className="text-center py-8">
                      <Phone className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400 mb-2">No numbers available right now</p>
                      <p className="text-sm text-slate-400 dark:text-slate-500">You can add a number later from Phone Numbers settings</p>
                    </div>
                  ) : numberSource === 'pool' ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {poolNumbers.map((number) => (
                        <button key={number.id} onClick={() => { setSelectedPoolNumber(number); setSelectedTelnyxNumber(null); }}
                          className={`w-full p-4 rounded-xl border-2 transition-all text-left ${selectedPoolNumber?.id === number.id ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">{formatPhoneNumber(number.phone_number)}</div>
                              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {number.region && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{number.region}</span>}
                                <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 rounded text-xs font-medium capitalize">{number.number_type || 'Toll-Free'}</span>
                              </div>
                            </div>
                            {selectedPoolNumber?.id === number.id && <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {telnyxNumbers.map((number) => (
                        <button key={number.phoneNumber} onClick={() => { setSelectedTelnyxNumber(number); setSelectedPoolNumber(null); }}
                          className={`w-full p-4 rounded-xl border-2 transition-all text-left ${selectedTelnyxNumber?.phoneNumber === number.phoneNumber ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">{formatPhoneNumber(number.phoneNumber)}</div>
                              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {number.region && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{number.region}</span>}
                                <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 rounded text-xs font-medium">Toll-Free</span>
                              </div>
                            </div>
                            {selectedTelnyxNumber?.phoneNumber === number.phoneNumber && <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {error && hasNumbers && <p className="text-red-500 text-sm text-center mt-4">{error}</p>}
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <button onClick={handleClaimNumber} disabled={!hasSelection || claiming}
                    className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-teal-500/25 disabled:shadow-none flex items-center justify-center gap-2">
                    {claiming ? (<><Loader2 className="w-5 h-5 animate-spin" />Claiming...</>) : (<>Claim This Number<ArrowRight className="w-5 h-5" /></>)}
                  </button>
                  <button onClick={handleSkip} className="w-full mt-3 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-sm font-medium transition-colors">
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
