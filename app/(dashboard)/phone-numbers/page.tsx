'use client';

import { useState, useEffect } from 'react';
import { Phone, Search, Plus, Star, Trash2, Loader2, CreditCard, ArrowRightLeft, Mail, CheckCircle, Clock, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import PurchaseNumberModal from '@/components/PurchaseNumberModal';

interface PhoneNumber {
  id: string;
  phone_number: string;
  phone_sid: string;
  friendly_name: string;
  /** Derived by trigger from the number itself (#129). */
  number_type?: string | null;
  /** Routing state (#122) — both are timestamps so they expire on their own. */
  locked_until?: string | null;
  rested_until?: string | null;
  rest_reason?: string | null;
  /**
   * Registration (audit, 2026-08-03). Computed server-side from the number's
   * type: a long code needs a 10DLC campaign, a toll-free needs verification.
   * `null` means Telnyx has not been asked yet — unknown, not unregistered.
   */
  can_send?: boolean | null;
  registration_gap?: string | null;
  /** Carriers assigned but not mapped — delivers elsewhere, so a warning. */
  unmapped_carriers?: string[];
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

interface PortingOrder {
  id: string;
  phone_number: string;
  carrier_name: string;
  status: 'submitted' | 'pending' | 'in_progress' | 'complete' | 'failed' | 'cancelled' | 'review_needed';
  status_details: string | null;
  submitted_at: string;
  completed_at: string | null;
  telnyx_porting_order_id: string | null;
}

export default function PhoneNumbersPage() {
  const [myNumbers, setMyNumbers] = useState<PhoneNumber[]>([]);
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
  const [numberGate, setNumberGate] = useState<{
    /** LOCAL numbers — the 10DLC gate. */
    allowed: boolean;
    reason?: string;
    /** Shared toll-free pool. Not 10DLC, so gated separately. */
    tollFreeAllowed: boolean;
    /** Can claim a pool number but has not registered — capped, not blocked. */
    provisional: boolean;
    provisionalLimits: { maxMessagesPerDay?: number; maxDailyMessages?: number } | null;
  } | null>(null);
  const [routingMode, setRoutingMode] = useState<'geo' | 'primary'>('geo');
  const [busyNumber, setBusyNumber] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, {
    sent: number; opt_outs: number; opt_out_rate: number;
    spam_ratio: number | null; verdict: 'ok'|'low_volume'|'watch'|'rest'; advice: string;
  }>>({});
  const [numberType, setNumberType] = useState<NumberType>('tollfree');

  // Purchase modal state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState('');
  const [userCredits, setUserCredits] = useState(0);

  // Porting state
  const [portingOrders, setPortingOrders] = useState<PortingOrder[]>([]);
  const [showPortForm, setShowPortForm] = useState(false);
  const [submittingPort, setSubmittingPort] = useState(false);
  const [portForm, setPortForm] = useState({
    phoneNumber: '',
    carrierName: '',
    accountNumber: '',
    accountPin: '',
    authorizedName: '',
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
  });

  // Show message temporarily
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Reads the same gate the acquisition routes enforce, so the page cannot
  // disagree with what actually happens on click (#1).
  const fetchNumberGate = async () => {
    try {
      const res = await fetch('/api/number-eligibility');
      const data = await res.json();
      // `allowed` is about LOCAL numbers; the shared pool is gated separately
      // now, because toll-free is not 10DLC. Both are carried so the page can
      // stop telling someone they cannot claim a number they can claim.
      if (data?.ok) setNumberGate({
        allowed: data.allowed,
        reason: data.reason ?? undefined,
        tollFreeAllowed: data.tollFreeAllowed ?? data.allowed,
        provisional: data.provisional ?? false,
        provisionalLimits: data.provisionalLimits ?? null,
      });
    } catch {
      // Leave it null — no banner rather than a wrong one.
    }
  };

  // Per-number health (#122). Separate from fetchMyNumbers because it makes a
  // Telnyx call per number — slow enough that the list should not wait on it.
  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/telnyx/numbers/health');
      const data = await res.json();
      if (!data.ok) return;
      const byNumber: any = {};
      for (const n of data.numbers) byNumber[n.phone_number] = n;
      setHealth(byNumber);
    } catch {
      // No health panel rather than a wrong one.
    }
  };

  // Routing controls (#122). One endpoint, one ownership check — the page just
  // names the action.
  const numberControl = async (
    action: 'set_primary' | 'lock' | 'rest' | 'clear' | 'set_mode',
    opts: { phoneNumber?: string; hours?: number; mode?: 'geo' | 'primary'; reason?: string } = {}
  ) => {
    setBusyNumber(opts.phoneNumber || 'mode');
    try {
      const res = await fetch('/api/telnyx/numbers/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...opts }),
      });
      const data = await res.json();
      if (!data.ok) {
        showMessage('error', data.error || 'Could not update the number');
        return;
      }
      if (action === 'set_mode' && opts.mode) {
        setRoutingMode(opts.mode);
        showMessage('success', opts.mode === 'geo'
          ? 'Now sending from the number closest to each contact'
          : 'Now sending from your primary number');
      } else {
        await fetchMyNumbers();
      }
    } catch {
      showMessage('error', 'Could not update the number');
    } finally {
      setBusyNumber(null);
    }
  };

  const isActiveUntil = (ts?: string | null) => !!ts && new Date(ts).getTime() > Date.now();
  const untilLabel = (ts?: string | null) =>
    ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  // Fetch user's phone numbers (handles auto-release of unverified numbers)
  const fetchMyNumbers = async () => {
    try {
      const response = await fetch('/api/telnyx/numbers');
      const data = await response.json();

      if (data.success) {
        setMyNumbers(data.numbers || []);
        if (data.numberSelectionMode) setRoutingMode(data.numberSelectionMode);
        // Alert user if unverified numbers were auto-released
        if (data.numbersReleased && data.numbersReleased.length > 0) {
          showMessage('error', data.releaseMessage || 'An unverified number was released. Please claim a verified number.');
          await loadPoolNumbers();
        }
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

  // Load available pool numbers (verified only)
  const loadPoolNumbers = async () => {
    try {
      setLoadingPool(true);
      const response = await fetch('/api/number-pool/available');
      const data = await response.json();

      if (data.success && data.numbers && data.numbers.length > 0) {
        setPoolNumbers(data.numbers);
      } else {
        setPoolNumbers([]);
      }
    } catch (error) {
      console.error('Error loading pool numbers:', error);
    } finally {
      setLoadingPool(false);
    }
  };

  // Claim a verified number from the pool
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

  // Fetch porting orders
  const fetchPortingOrders = async () => {
    try {
      const res = await fetch('/api/telnyx/port-number');
      const data = await res.json();
      if (data.orders) setPortingOrders(data.orders);
    } catch (e) {
      console.error('Error fetching porting orders:', e);
    }
  };

  // Submit port request
  const submitPortRequest = async () => {
    const { phoneNumber, carrierName, accountNumber, accountPin, authorizedName, billingStreet, billingCity, billingState, billingZip } = portForm;
    if (!phoneNumber || !carrierName || !accountNumber || !accountPin || !authorizedName || !billingStreet || !billingCity || !billingState || !billingZip) {
      showMessage('error', 'Please fill in all required fields.');
      return;
    }
    setSubmittingPort(true);
    try {
      const res = await fetch('/api/telnyx/port-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(portForm),
      });
      const data = await res.json();
      if (data.success) {
        showMessage('success', data.message);
        setShowPortForm(false);
        setPortForm({ phoneNumber: '', carrierName: '', accountNumber: '', accountPin: '', authorizedName: '', billingStreet: '', billingCity: '', billingState: '', billingZip: '' });
        await fetchPortingOrders();
      } else {
        showMessage('error', data.error || 'Failed to submit porting request.');
      }
    } catch (e) {
      showMessage('error', 'Failed to submit porting request.');
    } finally {
      setSubmittingPort(false);
    }
  };

  useEffect(() => {
    fetchMyNumbers();
    loadPoolNumbers();
    fetchUserCredits();
    fetchPortingOrders();
    fetchNumberGate();
    fetchHealth();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Why numbers are unavailable, stated before the user tries (#1). The
          three acquisition routes enforce this server-side regardless — this
          exists so the refusal is explained rather than merely delivered. */}
      {numberGate && !numberGate.allowed && (
        <div className="mb-6 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">
            {numberGate.provisional
              ? 'You can start now — registration unlocks the rest'
              : 'Business registration required before you can get a number'}
          </h2>
          {numberGate.provisional ? (
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
              Claim a shared toll-free number below and start sending straight away. Until your
              business is registered you can send up to{' '}
              {numberGate.provisionalLimits?.maxDailyMessages ?? 50} messages a day, because shared
              numbers send under our carrier verification. Registering lifts that and unlocks local
              numbers.
            </p>
          ) : (
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">{numberGate.reason}</p>
          )}
          <a
            href="/settings#messaging-registration"
            className="mt-3 inline-block text-sm font-semibold text-amber-900 dark:text-amber-200 underline underline-offset-2"
          >
            Finish business registration →
          </a>
        </div>
      )}

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
                <h2 className="text-2xl font-bold text-white">Start Sending Messages Now!</h2>
              </div>
              <p className="text-sky-200 mb-4">
                Claim a pre-verified number from our shared pool and send messages immediately - no waiting for verification!
              </p>
              <div className="flex flex-wrap gap-4">
                {poolNumbers.slice(0, 3).map((poolNum) => (
                  <div key={poolNum.id} className="flex-1 min-w-[250px] p-4 bg-gray-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-mono font-semibold text-lg text-white">
                          {poolNum.phone_number}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {poolNum.number_type === 'tollfree' ? 'Toll-Free' : 'Local'} • Included with your plan
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
                              {poolNum.number_type === 'tollfree' ? 'Toll-Free' : 'Local'} • Included with your plan
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
                {/* Routing mode (#122). Hidden with one number — there is nothing
                    to route between, and an inert control invites the belief
                    that something is being decided. */}
                {myNumbers.length > 1 && (
                  <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                    <div className="text-sm font-medium mb-1">Which number do messages come from?</div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Applies to everything — replies, drips, scheduled sends and campaigns.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['geo', 'Closest to the contact', 'Picks whichever of your numbers is nearest to each contact, by area code.'],
                        ['primary', 'Always my primary', 'Every message comes from the number marked Primary below.'],
                      ] as const).map(([value, label, hint]) => (
                        <button
                          key={value}
                          onClick={() => numberControl('set_mode', { mode: value })}
                          disabled={busyNumber === 'mode'}
                          title={hint}
                          className={`px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50 ${
                            routingMode === value
                              ? 'border-sky-600 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      A locked number overrides this.
                    </p>
                  </div>
                )}

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
                          {number.number_type === 'tollfree' ? 'Shared toll-free' : 'Your local number'} • Purchased {new Date(number.purchased_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => releaseNumber(number.phone_number)}
                        className="p-2 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Health (#122). Shown above the controls because it is the
                        reason someone would reach for Rest. */}
                    {health[number.phone_number] && (() => {
                      const h = health[number.phone_number];
                      const tone = h.verdict === 'rest'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
                        : h.verdict === 'watch'
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
                      return (
                        <div className={`mb-2 text-xs rounded border px-2.5 py-2 ${tone}`}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
                            <span>{h.sent} sent · 30 days</span>
                            <span>{h.opt_outs} opted out</span>
                            {h.sent > 0 && <span>{(h.opt_out_rate * 100).toFixed(1)}% opt-out rate</span>}
                            {h.spam_ratio !== null && <span>carrier spam {(h.spam_ratio * 100).toFixed(1)}%</span>}
                          </div>
                          <div className="mt-1 font-normal">{h.advice}</div>
                          {h.verdict === 'rest' && !isActiveUntil(number.rested_until) && (
                            <button
                              onClick={() => numberControl('rest', {
                                phoneNumber: number.phone_number, hours: 168,
                                reason: `Rested on recommendation (${(h.opt_out_rate * 100).toFixed(1)}% opt-out rate)`,
                              })}
                              disabled={busyNumber === number.phone_number}
                              className="mt-2 px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                            >
                              Rest this number for a week
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Registration (audit, 2026-08-03).
                        `can_send` is computed server-side so this cannot drift
                        from what resolveFromNumber does. null means nobody has
                        asked Telnyx yet — shown as unknown, not as a failure. */}
                    {number.can_send === false && (
                      <div className="mb-2 text-xs rounded px-2 py-1.5 inline-block bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300">
                        Cannot send — {number.registration_gap}. Carriers filter unregistered traffic,
                        so this number is skipped when choosing who to send from.
                      </div>
                    )}
                    {number.can_send === true && !number.unmapped_carriers?.length && (
                      <div className="mb-2 text-xs rounded px-2 py-1.5 inline-block bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300">
                        Registered to send
                      </div>
                    )}
                    {number.can_send === true && !!number.unmapped_carriers?.length && (
                      <div className="mb-2 text-xs rounded px-2 py-1.5 inline-block bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300">
                        Registered, but not active at {number.unmapped_carriers.join(' and ')} — messages
                        to those subscribers may be filtered. Telnyx support can re-run the carrier mapping.
                      </div>
                    )}

                    {/* Routing state and controls (#122) */}
                    {(isActiveUntil(number.locked_until) || isActiveUntil(number.rested_until)) && (
                      <div className={`mb-2 text-xs rounded px-2 py-1.5 inline-block ${
                        isActiveUntil(number.rested_until)
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                          : 'bg-sky-50 dark:bg-sky-900/20 text-sky-800 dark:text-sky-300'
                      }`}>
                        {isActiveUntil(number.rested_until)
                          ? <>Resting until {untilLabel(number.rested_until)} — not being used to send{number.rest_reason ? ` · ${number.rest_reason}` : ''}</>
                          : <>Locked until {untilLabel(number.locked_until)} — all messages use this number</>}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 mb-3">
                      {!number.is_primary && (
                        <button
                          onClick={() => numberControl('set_primary', { phoneNumber: number.phone_number })}
                          disabled={busyNumber === number.phone_number}
                          className="px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:border-slate-400 disabled:opacity-50"
                        >
                          Make primary
                        </button>
                      )}

                      {isActiveUntil(number.locked_until) || isActiveUntil(number.rested_until) ? (
                        <button
                          onClick={() => numberControl('clear', { phoneNumber: number.phone_number })}
                          disabled={busyNumber === number.phone_number}
                          className="px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:border-slate-400 disabled:opacity-50"
                        >
                          {isActiveUntil(number.rested_until) ? 'Put back in use' : 'Unlock'}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => numberControl('lock', { phoneNumber: number.phone_number, hours: 168 })}
                            disabled={busyNumber === number.phone_number}
                            title="Send everything from this number for the next week, ignoring the routing rule above."
                            className="px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:border-slate-400 disabled:opacity-50"
                          >
                            Lock for a week
                          </button>
                          <button
                            onClick={() => numberControl('rest', { phoneNumber: number.phone_number, hours: 168, reason: 'Rested manually' })}
                            disabled={busyNumber === number.phone_number}
                            title="Stop sending from this number for a week so its reputation with carriers can recover."
                            className="px-2.5 py-1 text-xs rounded border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:border-amber-500 disabled:opacity-50"
                          >
                            Rest for a week
                          </button>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {number.capabilities?.sms && number.capabilities?.voice && (
                        <span className="px-3 py-1 bg-sky-900/30 border border-sky-700 text-sky-600 rounded text-xs font-medium">
                          📱 Unified: SMS + Voice
                        </span>
                      )}
                      {number.capabilities?.sms && !number.capabilities?.voice && (
                        <span className="px-2 py-1 bg-blue-900/30 border border-sky-700 text-sky-600 rounded text-xs">
                          SMS
                        </span>
                      )}
                      {number.capabilities?.mms && (
                        <span className="px-2 py-1 bg-sky-800/60 border border-sky-600 text-sky-600 rounded text-xs">
                          MMS
                        </span>
                      )}
                      {number.capabilities?.voice && !number.capabilities?.sms && (
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
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700'
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
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700'
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
                        {number.capabilities?.sms && (
                          <span className="px-2 py-1 bg-gray-700/30 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded text-xs">
                            SMS
                          </span>
                        )}
                        {number.capabilities?.mms && (
                          <span className="px-2 py-1 bg-gray-700/30 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded text-xs">
                            MMS
                          </span>
                        )}
                        {number.capabilities?.voice && (
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
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Port Your Number
            </h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Bring your existing phone number from any carrier to HyveWyre. Typically takes 1–2 weeks.
            </p>
          </div>
          <button
            onClick={() => setShowPortForm(!showPortForm)}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            {showPortForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showPortForm ? 'Cancel' : 'Start Port Request'}
          </button>
        </div>

        {/* Existing porting orders */}
        {portingOrders.length > 0 && (
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Active Port Requests</h3>
            {portingOrders.map((order) => {
              const statusMap: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
                submitted:    { label: 'Submitted',    icon: <Clock className="h-4 w-4" />,        color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30' },
                pending:      { label: 'Pending',      icon: <Clock className="h-4 w-4" />,        color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
                in_progress:  { label: 'In Progress',  icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
                complete:     { label: 'Complete',     icon: <CheckCircle className="h-4 w-4" />,  color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
                review_needed:{ label: 'Under Review', icon: <AlertCircle className="h-4 w-4" />, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30' },
                failed:       { label: 'Failed',       icon: <XCircle className="h-4 w-4" />,     color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
                cancelled:    { label: 'Cancelled',    icon: <XCircle className="h-4 w-4" />,     color: 'text-slate-500 bg-slate-100 dark:bg-slate-700' },
              };
              const s = statusMap[order.status] || statusMap.submitted;
              return (
                <div key={order.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{order.phone_number}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Carrier: {order.carrier_name}</p>
                    {order.status_details && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{order.status_details}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${s.color}`}>
                    {s.icon}{s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Port request form */}
        {showPortForm && (
          <div className="p-6 space-y-5">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300">
              <strong>Before you start:</strong> Make sure the info below exactly matches what's on file with your current carrier. Mismatches will delay or reject the port.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone number */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number to Port <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="(555) 000-0000"
                  value={portForm.phoneNumber}
                  onChange={(e) => setPortForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Carrier */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Current Carrier <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="AT&T, Verizon, T-Mobile…"
                  value={portForm.carrierName}
                  onChange={(e) => setPortForm((p) => ({ ...p, carrierName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Account number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Carrier Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Found on your carrier bill"
                  value={portForm.accountNumber}
                  onChange={(e) => setPortForm((p) => ({ ...p, accountNumber: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Account PIN */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Account PIN / Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Your carrier account PIN"
                  value={portForm.accountPin}
                  onChange={(e) => setPortForm((p) => ({ ...p, accountPin: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Authorized name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Authorized Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Name on carrier account"
                  value={portForm.authorizedName}
                  onChange={(e) => setPortForm((p) => ({ ...p, authorizedName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Billing address */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Billing Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="123 Main St"
                  value={portForm.billingStreet}
                  onChange={(e) => setPortForm((p) => ({ ...p, billingStreet: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="City"
                  value={portForm.billingCity}
                  onChange={(e) => setPortForm((p) => ({ ...p, billingCity: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="TX"
                    maxLength={2}
                    value={portForm.billingState}
                    onChange={(e) => setPortForm((p) => ({ ...p, billingState: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ZIP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="00000"
                    value={portForm.billingZip}
                    onChange={(e) => setPortForm((p) => ({ ...p, billingZip: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={submitPortRequest}
                disabled={submittingPort}
                className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {submittingPort ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                {submittingPort ? 'Submitting…' : 'Submit Port Request'}
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Your number stays active with your current carrier until porting is complete.
              </p>
            </div>
          </div>
        )}

        {!showPortForm && portingOrders.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No port requests yet. Click <strong>Start Port Request</strong> to begin.
          </div>
        )}
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
