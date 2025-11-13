'use client';

import { useState, useEffect } from 'react';
import { Phone, Search, Plus, Star, Trash2, Loader2 } from 'lucide-react';

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

  // Show message temporarily
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Fetch user's phone numbers
  const fetchMyNumbers = async () => {
    try {
      const response = await fetch('/api/twilio/numbers');
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
      const response = await fetch('/api/twilio/search-numbers', {
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
      const response = await fetch('/api/twilio/purchase-number', {
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
  const releaseNumber = async (phoneSid: string, phoneNumber: string) => {
    if (!confirm(`Are you sure you want to release ${phoneNumber}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch('/api/twilio/release-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneSid }),
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

  // Load available pool numbers
  const loadPoolNumbers = async () => {
    try {
      setLoadingPool(true);
      const response = await fetch('/api/number-pool/available');
      const data = await response.json();

      if (data.success) {
        setPoolNumbers(data.numbers || []);
      }
    } catch (error) {
      console.error('Error loading pool numbers:', error);
    } finally {
      setLoadingPool(false);
    }
  };

  // Claim a number from the pool
  const claimPoolNumber = async (numberId: string) => {
    setClaimingPool(true);

    try {
      const response = await fetch('/api/number-pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberId }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', data.message || 'Number claimed successfully! You can start sending messages immediately.');
        await fetchMyNumbers();
        await loadPoolNumbers(); // Refresh pool
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

  useEffect(() => {
    fetchMyNumbers();
    loadPoolNumbers();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Message Banner */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-900/20 border border-green-700 text-green-400'
              : 'bg-red-900/20 border border-red-700 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Phone Numbers</h1>
        <p className="text-gray-400">
          Manage your Twilio phone numbers. Purchase new numbers or view your existing ones.
        </p>
      </div>

      {/* Instant Access Pool Banner */}
      {poolNumbers.length > 0 && (
        <div className="mb-6 p-6 bg-gradient-to-r from-green-900/20 to-blue-900/20 border-2 border-green-500/50 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full uppercase">
                  Instant Access
                </div>
                <h2 className="text-2xl font-bold text-white">Start Sending Messages Now!</h2>
              </div>
              <p className="text-green-200 mb-4">
                Claim a pre-verified number from our shared pool and send messages immediately - no waiting for verification!
              </p>
              <div className="flex flex-wrap gap-4">
                {poolNumbers.slice(0, 3).map((poolNum) => (
                  <div key={poolNum.id} className="flex-1 min-w-[250px] p-4 bg-gray-900/50 border border-white/10 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-mono font-semibold text-lg text-white">
                          {poolNum.phone_number}
                        </div>
                        <div className="text-xs text-gray-400">
                          {poolNum.number_type === 'tollfree' ? 'Toll-Free' : 'Local'} • ${poolNum.monthly_cost}/mo
                        </div>
                      </div>
                      <div className="text-green-400 text-xs font-semibold">
                        ✓ Verified
                      </div>
                    </div>
                    <button
                      onClick={() => claimPoolNumber(poolNum.id)}
                      disabled={claimingPool}
                      className="w-full mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium text-sm transition-colors flex items-center justify-center gap-2"
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
                <p className="text-sm text-gray-400 mt-4">
                  +{poolNumbers.length - 3} more numbers available
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My Numbers Section */}
        <div className="bg-gray-800/50 border border-white/10 rounded-lg">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Phone className="h-5 w-5" />
              My Phone Numbers
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {myNumbers.length} number{myNumbers.length !== 1 ? 's' : ''} owned
            </p>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : myNumbers.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400 mb-4">
                  You don't have any phone numbers yet.
                </p>
                <p className="text-sm text-gray-500">
                  Search and purchase numbers from the panel on the right.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {myNumbers.map((number) => (
                  <div
                    key={number.id}
                    className="p-4 bg-gray-900/50 border border-white/5 rounded-lg hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-lg">
                            {number.phone_number}
                          </span>
                          {number.is_primary && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-blue-900/30 border border-blue-700 text-blue-400 rounded text-xs">
                              <Star className="h-3 w-3" />
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          $1.00/month • Purchased {new Date(number.purchased_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => releaseNumber(number.phone_sid, number.phone_number)}
                        className="p-2 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {number.capabilities.sms && (
                        <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded text-xs">
                          SMS
                        </span>
                      )}
                      {number.capabilities.mms && (
                        <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded text-xs">
                          MMS
                        </span>
                      )}
                      {number.capabilities.voice && (
                        <span className="px-2 py-1 bg-gray-700/50 text-gray-300 rounded text-xs">
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
        <div className="bg-gray-800/50 border border-white/10 rounded-lg">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buy New Number
            </h2>
            <p className="text-sm text-gray-400 mt-1">
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
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
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
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Local (Requires A2P)
                </button>
              </div>

              {/* Info Banner */}
              {numberType === 'tollfree' && (
                <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
                  <div className="flex gap-2">
                    <div className="text-green-400 font-semibold text-sm">✓ Works Immediately</div>
                  </div>
                  <p className="text-xs text-green-300 mt-1">
                    Toll-free numbers (1-800, 1-888, etc.) work instantly. No A2P registration required!
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Cost: ~$2/month</p>
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
                  <p className="text-xs text-gray-400 mt-1">Cost: ~$1/month + $15 A2P registration fee</p>
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
                        className="w-full px-3 py-2 bg-gray-900/50 border border-white/10 rounded-lg focus:outline-none focus:border-white/30"
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
                        className="w-full px-3 py-2 bg-gray-900/50 border border-white/10 rounded-lg focus:outline-none focus:border-white/30"
                      />
                    </div>
                  </>
                )}

                <button
                  onClick={searchNumbers}
                  disabled={searching || (numberType === 'local' && !areaCode && !searchQuery)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
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
                      className="p-3 bg-gray-900/50 border border-white/5 rounded-lg hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold">
                              {number.phoneNumber}
                            </span>
                            <span className="text-xs text-green-400 font-semibold">
                              $1.00/mo
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {number.locality}, {number.region}
                          </span>
                        </div>
                        <button
                          onClick={() => purchaseNumber(number.phoneNumber)}
                          disabled={purchasing !== null}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium text-sm transition-colors flex items-center gap-1"
                        >
                          {purchasing === number.phoneNumber ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              Buy
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {number.capabilities.sms && (
                          <span className="px-2 py-1 bg-gray-700/30 text-gray-400 border border-white/10 rounded text-xs">
                            SMS
                          </span>
                        )}
                        {number.capabilities.mms && (
                          <span className="px-2 py-1 bg-gray-700/30 text-gray-400 border border-white/10 rounded text-xs">
                            MMS
                          </span>
                        )}
                        {number.capabilities.voice && (
                          <span className="px-2 py-1 bg-gray-700/30 text-gray-400 border border-white/10 rounded text-xs">
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
    </div>
  );
}
