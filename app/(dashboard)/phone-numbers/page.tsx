'use client';

import { useState, useEffect } from 'react';
import { Phone, Search, Plus, Star, Trash2, Loader2, CreditCard, ArrowRightLeft, Mail } from 'lucide-react';
import PurchaseNumberModal from '@/components/PurchaseNumberModal';

interface TwilioNumber {
  id: string;
  phone_number: string;
  phone_sid: string;
  friendly_name: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
    rcs: boolean;
  };
  is_primary: boolean;
  status: string;
  purchased_at: string;
}

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  monthlyPrice?: string;
  setupPrice?: string;
}

interface PoolNumber {
  id: string;
  phone_number: string;
  phone_sid: string;
  friendly_name: string;
  number_type: string;
  capabilities: any;
  is_verified: boolean;
  monthly_cost: number;
}

type NumberType = 'local' | 'tollfree';

export default function PhoneNumbersPage() {
  const [myNumbers, setMyNumbers] = useState<TwilioNumber[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [poolNumbers, setPoolNumbers] = useState<PoolNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [claimingPool, setClaimingPool] = useState(false);
  const [loadingPool, setLoadingPool] = useState(false);
  const [areaCode, setAreaCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [numberType, setNumberType] = useState<NumberType>('tollfree');

  // Purchase modal state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState('');
  const [userCredits, setUserCredits] = useState(0);

  // Show message temporarily
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Fetch user's phone numbers
  const fetchMyNumbers = async () => {
    try {
      const response = await fetch('/api/telnyx/numbers');
      const data = await response.json();

      if (data.success) {
        setMyNumbers(data.numbers || []);
      } else {
        showMessage('error', data.error || 'Failed to fetch your phone numbers');
      }
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      showMessage('error', 'Failed to load phone numbers');
    } finally {
      setLoading(false);
    }
  };

  // Search for available numbers
  const searchNumbers = async () => {
    // For toll-free, we don't need area code or search query
    if (numberType === 'local' && !areaCode && !searchQuery) {
      showMessage('error', 'Please enter an area code or search query for local numbers');
      return;
    }

    setSearching(true);
    setAvailableNumbers([]);

    try {
      const response = await fetch('/api/telnyx/search-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: 'US',
          areaCode: numberType === 'local' ? (areaCode || undefined) : undefined,
          contains: numberType === 'local' ? (searchQuery || undefined) : undefined,
          tollFree: numberType === 'tollfree',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAvailableNumbers(data.numbers || []);
        if (data.numbers.length === 0) {
          showMessage('error', 'No numbers found matching your search');
        } else {
          showMessage('success', `Found ${data.numbers.length} available numbers`);
        }
      } else {
        showMessage('error', data.error || 'Failed to search numbers');
      }
    } catch (error) {
      console.error('Error searching numbers:', error);
      showMessage('error', 'Failed to search for phone numbers');
    } finally {
      setSearching(false);
    }
  };

  // Purchase a number
  const purchaseNumber = async (phoneNumber: string) => {
    setPurchasing(phoneNumber);

    try {
      const response = await fetch('/api/telnyx/purchase-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', `Successfully purchased ${phoneNumber}!`);
        setAvailableNumbers((prev) => prev.filter((n) => n.phoneNumber !== phoneNumber));
        await fetchMyNumbers();
      } else {
        showMessage('error', data.error || 'Failed to purchase number');
      }
    } catch (error) {
      console.error('Error purchasing number:', error);
      showMessage('error', 'Failed to purchase phone number');
    } finally {
      setPurchasing(null);
    }
  };

  // Release/delete a number
  const releaseNumber = async (phoneNumber: string) => {
    if (!confirm(`Are you sure you want to release ${phoneNumber}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch('/api/telnyx/release-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', `Released ${phoneNumber}`);
        await fetchMyNumbers();
      } else {
        showMessage('error', data.error || 'Failed to release number');
      }
    } catch (error) {
      console.error('Error releasing number:', error);
      showMessage('error', 'Failed to release phone number');
    }
  };

  // Load available pool numbers, fall back to Telnyx search if pool is empty
  const loadPoolNumbers = async () => {
    try {
      setLoadingPool(true);
      const response = await fetch('/api/number-pool/available');
      const data = await response.json();

      if (data.success && data.numbers && data.numbers.length > 0) {
        setPoolNumbers(data.numbers);
        return;
      }

      // Pool is empty — search Telnyx for toll-free numbers as fallback
      const telnyxResponse = await fetch('/api/telnyx/search-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tollFree: true, countryCode: 'US', limit: 10 }),
      });
      const telnyxData = await telnyxResponse.json();

      if (telnyxData.success && telnyxData.numbers && telnyxData.numbers.length > 0) {
        // Convert Telnyx search results to pool-like format for the UI
        const converted: PoolNumber[] = telnyxData.numbers.map((n: any, i: number) => ({
          id: `telnyx-${i}`,
          phone_number: n.phoneNumber,
          phone_sid: '',
          friendly_name: n.friendlyName,
          number_type: 'tollfree',
          capabilities: n.capabilities || { sms: true, mms: true, voice: true },
          is_verified: true,
          monthly_cost: 1,
        }));
        setPoolNumbers(converted);
      }
    } catch (error) {
      console.error('Error loading pool numbers:', error);
    } finally {
      setLoadingPool(false);
    }
  };

  // Claim a number from the pool or purchase from Telnyx
  const claimPoolNumber = async (numberId: string) => {
    setClaimingPool(true);

    try {
      // If it's a Telnyx search result (not from pool), purchase directly
      if (numberId.startsWith('telnyx-')) {
        const poolNum = poolNumbers.find(n => n.id === numberId);
        if (!poolNum) {
          showMessage('error', 'Number not found');
          return;
        }

        const response = await fetch('/api/telnyx/purchase-number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: poolNum.phone_number }),
        });

        const data = await response.json();

        if (data.success) {
          showMessage('success', `Number ${poolNum.phone_number} claimed! It will be ready shortly.`);
          await fetchMyNumbers();
          await loadPoolNumbers();
        } else {
          showMessage('error', data.error || 'Failed to claim number');
        }
        return;
      }

      // Standard pool claim
      const response = await fetch('/api/number-pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberId }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', data.message || 'Number claimed successfully! You can start sending messages immediately.');
        await fetchMyNumbers();
        await loadPoolNumbers();
      } else {
        showMessage('error', data.error || 'Failed to claim number');
      }
    } catch (error) {
      console.error('Error claiming pool number:', error);
      showMessage('error', 'Failed to claim number');
    } finally {
      setClaimingPool(false);
    }
  };

  // Fetch user credits
  const fetchUserCredits = async () => {
    try {
      const response = await fetch('/api/user/profile');
      const data = await response.json();
      setUserCredits(data.credits || 0);
    } catch (error) {
      console.error('Error fetching user credits:', error);
    }
  };

  // Open purchase modal
  const openPurchaseModal = (phoneNumber: string) => {
    setSelectedPhoneNumber(phoneNumber);
    setShowPurchaseModal(true);
  };

  // Handle successful purchase
  const handlePurchaseSuccess = () => {
    showMessage('success', `Successfully purchased ${selectedPhoneNumber}!`);
    setAvailableNumbers((prev) => prev.filter((n) => n.phoneNumber !== selectedPhoneNumber));
    fetchMyNumbers();
    fetchUserCredits();
  };

  useEffect(() => {
    fetchMyNumbers();
    loadPoolNumbers();
    fetchUserCredits();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Message Banner */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-sky-100 dark:bg-sky-900/20 border border-sky-700 text-sky-600'
              : 'bg-red-100 dark:bg-red-900/20 border border-red-700 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Phone Numbers</h1>
        <p className="text-slate-400 dark:text-slate-500">
          Manage your unified phone numbers. Each number supports both SMS and Voice calls - use the same number for texting and calling your leads.
        </p>
      </div>

      {/* Instant Access Pool Banner */}
      {poolNumbers.length > 0 && (
        <div className="mb-6 p-6 bg-gradient-to-r from-sky-900/20 to-sky-800/50 border-2 border-sky-500/50 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="px-3 py-1 bg-sky-600 text-white text-xs font-bold rounded-full uppercase">
                  Instant Access
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Start Sending Messages Now!</h2>
              </div>
              <p className="text-sky-200 mb-4">
                Claim a pre-verified number from our shared pool and send messages immediately - no waiting for verification!
              </p>
              <div className="flex flex-wrap gap-4">
                {poolNumbers.slice(0, 3).map((poolNum) => (
                  <div key={poolNum.id} className="flex-1 min-w-[250px] p-4 bg-gray-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-mono font-semibold text-lg text-gray-900">
                          {poolNum.phone_number}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {poolNum.number_type === 'tollfree' ? 'Toll-Free' : 'Local'} • ${poolNum.monthly_cost}/mo
                        </div>
                      </div>
                      <div className="text-sky-600 text-xs font-semibold">
                        ✓ Verified
                      </div>
                    </div>
                    <button
                      onClick={() => claimPoolNumber(poolNum.id)}
                      disabled={claimingPool}
                      className="w-full mt-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {claimingPool ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Claiming...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          Claim This Number
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
              {poolNumbers.length > 3 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-4">
                  +{poolNumbers.length - 3} more numbers available
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My Numbers Section */}
        <div className="bg-gray-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Phone className="h-5 w-5" />
              My Phone Numbers
            </h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              {myNumbers.length} number{myNumbers.length !== 1 ? 's' : ''} owned
            </p>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
              </div>
            ) : myNumbers.length === 0 ? (
              <div className="space-y-4">
                {/* Claim free number from pool */}
                {loadingPool ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500">Searching for available numbers...</p>
                  </div>
                ) : poolNumbers.length > 0 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full">FREE</span>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">Claim a Phone Number</h3>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      Select a toll-free number included with your plan — no extra cost!
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {poolNumbers.map((poolNum) => (
                        <div key={poolNum.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 rounded-lg hover:border-sky-300 dark:hover:border-sky-600 transition-colors">
                          <div>
                            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">{poolNum.phone_number}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {poolNum.number_type === 'tollfree' ? 'Toll-Free' : 'Local'} • ${poolNum.monthly_cost}/mo
                              <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">Free with plan</span>
                            </div>
                          </div>
                          <button
                            onClick={() => claimPoolNumber(poolNum.id)}
                            disabled={claimingPool}
                            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                          >
                            {claimingPool ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Claiming...</>
                            ) : (
                              <><Plus className="h-3 w-3" /> Claim</>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Phone className="h-12 w-12 mx-auto text-slate-600 dark:text-slate-400 mb-4" />
                    <p className="text-slate-400 dark:text-slate-500 mb-2">
                      You don't have any phone numbers yet.
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Search and purchase a number from the panel on the right, or purchase a point pack to unlock free numbers.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {myNumbers.map((number) => (
                  <div
                    key={number.id}
                    className="p-4 bg-gray-900/50 border border-white/5 rounded-lg hover:border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-lg">
                            {number.phone_number}
                          </span>
                          {number.is_primary && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-blue-900/30 border border-sky-700 text-sky-600 rounded text-xs">
                              <Star className="h-3 w-3" />
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          $1.00/month • Purchased {new Date(number.purchased_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => releaseNumber(number.phone_number)}
                        className="p-2 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {number.capabilities.sms && number.capabilities.voice && (
                        <span className="px-3 py-1 bg-sky-900/30 border border-sky-700 text-sky-600 rounded text-xs font-medium">
                          📱 Unified: SMS + Voice
                        </span>
                      )}
                      {number.capabilities.sms && !number.capabilities.voice && (
                        <span className="px-2 py-1 bg-blue-900/30 border border-sky-700 text-sky-600 rounded text-xs">
                          SMS
                        </span>
                      )}
                      {number.capabilities.mms && (
                        <span className="px-2 py-1 bg-sky-800/60 border border-sky-600 text-sky-600 rounded text-xs">
                          MMS
                        </span>
                      )}
                      {number.capabilities.voice && !number.capabilities.sms && (
                        <span className="px-2 py-1 bg-orange-900/30 border border-orange-700 text-sky-600 rounded text-xs">
                          Voice
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search & Purchase Section */}
        <div className="bg-gray-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buy New Number
            </h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Search for available phone numbers to purchase
            </p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {/* Number Type Tabs */}
              <div className="flex gap-2 p-1 bg-gray-900/50 rounded-lg">
                <button
                  onClick={() => {
                    setNumberType('tollfree');
                    setAvailableNumbers([]);
                  }}
                  className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                    numberType === 'tollfree'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100 hover:bg-white'
                  }`}
                >
                  Toll-Free (Recommended)
                </button>
                <button
                  onClick={() => {
                    setNumberType('local');
                    setAvailableNumbers([]);
                  }}
                  className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                    numberType === 'local'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100 hover:bg-white'
                  }`}
                >
                  Local (Requires A2P)
                </button>
              </div>

              {/* Info Banner */}
              {numberType === 'tollfree' && (
                <div className="p-4 bg-sky-100 dark:bg-sky-900/20 border border-sky-700 rounded-lg">
                  <div className="flex gap-2">
                    <div className="text-sky-600 font-semibold text-sm">✓ Works Immediately</div>
                  </div>
                  <p className="text-xs text-sky-300 mt-1">
                    Toll-free numbers (1-800, 1-888, etc.) work instantly. No A2P registration required!
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cost: ~$2/month</p>
                </div>
              )}

              {numberType === 'local' && (
                <div className="p-4 bg-amber-900/20 border border-amber-700 rounded-lg">
                  <div className="flex gap-2">
                    <div className="text-amber-400 font-semibold text-sm">⚠ A2P Registration Required</div>
                  </div>
                  <p className="text-xs text-amber-300 mt-1">
                    Local numbers (10-digit) require A2P 10DLC registration. Messages will be blocked until approved (1-7 days).
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cost: ~$1/month + $15 A2P registration fee</p>
                </div>
              )}

              {/* Search Form */}
              <div className="space-y-3">
                {numberType === 'local' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Area Code (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 415"
                        value={areaCode}
                        onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                        maxLength={3}
                        className="w-full px-3 py-2 bg-gray-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-white/30"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Contains (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 555"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-900/50 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-white/30"
                      />
                    </div>
                  </>
                )}

                <button
                  onClick={searchNumbers}
                  disabled={searching || (numberType === 'local' && !areaCode && !searchQuery)}
                  className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {searching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      {numberType === 'tollfree' ? 'Find Toll-Free Numbers' : 'Search Local Numbers'}
                    </>
                  )}
                </button>
              </div>

              {/* Results */}
              {availableNumbers.length > 0 && (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  <h4 className="font-medium text-sm">Available Numbers</h4>
                  {availableNumbers.map((number) => (
                    <div
                      key={number.phoneNumber}
                      className="p-3 bg-gray-900/50 border border-white/5 rounded-lg hover:border-slate-200 dark:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold">
                              {number.phoneNumber}
                            </span>
                            <span className="text-xs text-sky-600 font-semibold">
                              $1.00/mo
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {number.locality}, {number.region}
                          </span>
                        </div>
                        <button
                          onClick={() => openPurchaseModal(number.phoneNumber)}
                          disabled={purchasing !== null}
                          className="px-3 py-1 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium text-sm transition-colors flex items-center gap-1"
                        >
                          <CreditCard className="h-3 w-3" />
                          Buy
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {number.capabilities.sms && (
                          <span className="px-2 py-1 bg-gray-700/30 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded text-xs">
                            SMS
                          </span>
                        )}
                        {number.capabilities.mms && (
                          <span className="px-2 py-1 bg-gray-700/30 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded text-xs">
                            MMS
                          </span>
                        )}
                        {number.capabilities.voice && (
                          <span className="px-2 py-1 bg-gray-700/30 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded text-xs">
                            Voice
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Number Porting Section */}
      <div className="mt-6 bg-gray-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Port Your Number
          </h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Bring your existing phone number to HyveWyre
          </p>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            <ArrowRightLeft className="h-12 w-12 mx-auto text-slate-500 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Want to keep your current number?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">
              We can port your existing phone number from any carrier to HyveWyre. The process typically
              takes 1-2 weeks and your number will continue working during the transfer.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="mailto:support@hyvewyre.com?subject=Number%20Porting%20Request&body=Hi%2C%20I%27d%20like%20to%20port%20my%20existing%20phone%20number%20to%20HyveWyre.%0A%0AMy%20current%20number%3A%20%0AMy%20current%20carrier%3A%20%0A"
                className="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors"
              >
                <Mail className="h-4 w-4" />
                Contact Us to Port
              </a>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              You'll need: your current phone number, carrier name, and account PIN/password.
            </p>
          </div>
        </div>
      </div>

      {/* Purchase Number Modal */}
      <PurchaseNumberModal
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        phoneNumber={selectedPhoneNumber}
        onSuccess={handlePurchaseSuccess}
        userCredits={userCredits}
      />
    </div>
  );
}
