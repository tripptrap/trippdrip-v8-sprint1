'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Sparkles, Minimize2, Maximize2, Briefcase, RefreshCw, Clock, AlertTriangle, Shield, ShieldCheck, ShieldAlert, Wand2 } from 'lucide-react';
import { analyzeSpamContent, type SpamAnalysis } from '@/lib/ai/spam-detection';

// Helper function to guess timezone from phone number area code
function getTimezoneFromPhone(phone: string | undefined): { abbr: string; name: string } | null {
  if (!phone) return null;

  const cleaned = phone.replace(/\D/g, '');
  const areaCode = cleaned.length >= 10 ? cleaned.substring(cleaned.length - 10, cleaned.length - 7) : '';

  const timezoneMap: { [key: string]: { abbr: string; name: string } } = {
    // Eastern Time
    '212': { abbr: 'ET', name: 'America/New_York' }, '646': { abbr: 'ET', name: 'America/New_York' },
    '917': { abbr: 'ET', name: 'America/New_York' }, '347': { abbr: 'ET', name: 'America/New_York' },
    '305': { abbr: 'ET', name: 'America/New_York' }, '786': { abbr: 'ET', name: 'America/New_York' },
    '954': { abbr: 'ET', name: 'America/New_York' }, '404': { abbr: 'ET', name: 'America/New_York' },
    '678': { abbr: 'ET', name: 'America/New_York' }, '770': { abbr: 'ET', name: 'America/New_York' },
    '617': { abbr: 'ET', name: 'America/New_York' }, '857': { abbr: 'ET', name: 'America/New_York' },
    '202': { abbr: 'ET', name: 'America/New_York' }, '215': { abbr: 'ET', name: 'America/New_York' },
    '267': { abbr: 'ET', name: 'America/New_York' }, '407': { abbr: 'ET', name: 'America/New_York' },
    '321': { abbr: 'ET', name: 'America/New_York' }, '704': { abbr: 'ET', name: 'America/New_York' },
    '980': { abbr: 'ET', name: 'America/New_York' }, '757': { abbr: 'ET', name: 'America/New_York' },
    '804': { abbr: 'ET', name: 'America/New_York' }, '813': { abbr: 'ET', name: 'America/New_York' },
    '727': { abbr: 'ET', name: 'America/New_York' }, '561': { abbr: 'ET', name: 'America/New_York' },
    // Central Time
    '312': { abbr: 'CT', name: 'America/Chicago' }, '773': { abbr: 'CT', name: 'America/Chicago' },
    '872': { abbr: 'CT', name: 'America/Chicago' }, '713': { abbr: 'CT', name: 'America/Chicago' },
    '281': { abbr: 'CT', name: 'America/Chicago' }, '832': { abbr: 'CT', name: 'America/Chicago' },
    '214': { abbr: 'CT', name: 'America/Chicago' }, '469': { abbr: 'CT', name: 'America/Chicago' },
    '972': { abbr: 'CT', name: 'America/Chicago' }, '210': { abbr: 'CT', name: 'America/Chicago' },
    '726': { abbr: 'CT', name: 'America/Chicago' }, '512': { abbr: 'CT', name: 'America/Chicago' },
    '737': { abbr: 'CT', name: 'America/Chicago' }, '314': { abbr: 'CT', name: 'America/Chicago' },
    '504': { abbr: 'CT', name: 'America/Chicago' }, '615': { abbr: 'CT', name: 'America/Chicago' },
    '629': { abbr: 'CT', name: 'America/Chicago' }, '901': { abbr: 'CT', name: 'America/Chicago' },
    // Mountain Time
    '303': { abbr: 'MT', name: 'America/Denver' }, '720': { abbr: 'MT', name: 'America/Denver' },
    '602': { abbr: 'MT', name: 'America/Phoenix' }, '623': { abbr: 'MT', name: 'America/Phoenix' },
    '480': { abbr: 'MT', name: 'America/Phoenix' }, '505': { abbr: 'MT', name: 'America/Denver' },
    '801': { abbr: 'MT', name: 'America/Denver' }, '385': { abbr: 'MT', name: 'America/Denver' },
    // Pacific Time
    '213': { abbr: 'PT', name: 'America/Los_Angeles' }, '310': { abbr: 'PT', name: 'America/Los_Angeles' },
    '323': { abbr: 'PT', name: 'America/Los_Angeles' }, '424': { abbr: 'PT', name: 'America/Los_Angeles' },
    '818': { abbr: 'PT', name: 'America/Los_Angeles' }, '415': { abbr: 'PT', name: 'America/Los_Angeles' },
    '628': { abbr: 'PT', name: 'America/Los_Angeles' }, '619': { abbr: 'PT', name: 'America/Los_Angeles' },
    '858': { abbr: 'PT', name: 'America/Los_Angeles' }, '206': { abbr: 'PT', name: 'America/Los_Angeles' },
    '253': { abbr: 'PT', name: 'America/Los_Angeles' }, '503': { abbr: 'PT', name: 'America/Los_Angeles' },
    '971': { abbr: 'PT', name: 'America/Los_Angeles' }, '702': { abbr: 'PT', name: 'America/Los_Angeles' },
    '916': { abbr: 'PT', name: 'America/Los_Angeles' }, '925': { abbr: 'PT', name: 'America/Los_Angeles' },
  };

  return timezoneMap[areaCode] || null;
}

function getLocalTime(timezone: { abbr: string; name: string } | null): string {
  if (!timezone) return '';
  try {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      timeZone: timezone.name,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${timeString} ${timezone.abbr}`;
  } catch (e) {
    return '';
  }
}

// Format phone number to E.164 format (+1XXXXXXXXXX)
function formatPhoneE164(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If empty, return empty
  if (!digits) return '';

  // If already has country code (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // If 10 digits (US number without country code)
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If already starts with +, keep as is
  if (phone.startsWith('+')) {
    return phone;
  }

  // Otherwise return with + prefix
  return digits.length > 0 ? `+${digits}` : '';
}

interface SendSMSModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  leadPhone?: string;
  onSuccess?: () => void;
}

export default function SendSMSModal({
  isOpen,
  onClose,
  leadId,
  leadName = '',
  leadPhone,
  onSuccess,
}: SendSMSModalProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fromNumber, setFromNumber] = useState('');
  const [toPhone, setToPhone] = useState(leadPhone || '');
  const [availableNumbers, setAvailableNumbers] = useState<Array<{ phone_number: string; friendly_name?: string; is_primary: boolean }>>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(true);
  const [rephrasing, setRephrasing] = useState(false);

  // Spam detection state
  const [spamAnalysis, setSpamAnalysis] = useState<SpamAnalysis | null>(null);
  const [fixingSpam, setFixingSpam] = useState(false);
  const [showSpamDetails, setShowSpamDetails] = useState(false);

  // Analyze message for spam as user types (debounced)
  useEffect(() => {
    if (!message.trim()) {
      setSpamAnalysis(null);
      return;
    }

    const timer = setTimeout(() => {
      const analysis = analyzeSpamContent(message);
      setSpamAnalysis(analysis);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [message]);

  // Load phone numbers from Telnyx when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTelnyxNumbers();
      // Set or reset toPhone based on leadPhone prop, auto-format to E.164
      setToPhone(leadPhone ? formatPhoneE164(leadPhone) : '');
      setMessage('');
      setError('');
      setSuccess(false);
      setSpamAnalysis(null);
      setShowSpamDetails(false);
    }
  }, [isOpen, leadPhone]);

  const loadTelnyxNumbers = async () => {
    try {
      setLoadingNumbers(true);
      const response = await fetch('/api/telnyx/numbers');
      const data = await response.json();

      if (data.success && data.numbers?.length > 0) {
        const numbers = data.numbers.map((n: any, idx: number) => ({
          phone_number: n.phone_number,
          friendly_name: n.friendly_name,
          is_primary: idx === 0
        }));
        setAvailableNumbers(numbers);
        // Auto-select primary (first number)
        setFromNumber(numbers[0].phone_number);
        console.log('Auto-selected Telnyx number:', numbers[0].phone_number);
      } else {
        console.log('No Telnyx numbers found');
      }
    } catch (error) {
      console.error('Error loading Telnyx numbers:', error);
    } finally {
      setLoadingNumbers(false);
    }
  };

  const handleRephrase = async (style: 'shorter' | 'longer' | 'professional' | 'rewrite') => {
    if (!message.trim()) {
      setError('Please enter a message to rephrase');
      return;
    }

    setRephrasing(true);
    setError('');

    const prompts = {
      shorter: 'Make this message shorter and more concise while keeping the main point:',
      longer: 'Make this message longer and more detailed while staying conversational:',
      professional: 'Make this message more professional and polished:',
      rewrite: 'Rewrite this message in a different way while keeping the same meaning:'
    };

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `${prompts[style]}\n\n"${message}"\n\nProvide only the rephrased message, no explanations.`
            }
          ],
          model: 'gpt-4o-mini'
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error('Invalid response from server. Please try again.');
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to rephrase message');
      }

      if (data.reply) {
        setMessage(data.reply.trim());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to rephrase message');
    } finally {
      setRephrasing(false);
    }
  };

  // AI-powered spam fix - rewrites message to avoid spam triggers
  const handleFixSpam = async () => {
    if (!message.trim() || !spamAnalysis || spamAnalysis.score === 0) {
      return;
    }

    setFixingSpam(true);
    setError('');

    try {
      const response = await fetch('/api/ai/spam-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          rewrite: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fix spam');
      }

      if (data.rewrittenMessage && data.rewrittenMessage !== message) {
        setMessage(data.rewrittenMessage);
        // Re-analyze the new message
        const newAnalysis = analyzeSpamContent(data.rewrittenMessage);
        setSpamAnalysis(newAnalysis);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fix spam words');
    } finally {
      setFixingSpam(false);
    }
  };

  // Get spam indicator color and icon
  const getSpamIndicator = () => {
    if (!spamAnalysis || spamAnalysis.score === 0) {
      return { color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: ShieldCheck, label: 'Safe' };
    }
    switch (spamAnalysis.riskLevel) {
      case 'low':
        return { color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: Shield, label: 'Low Risk' };
      case 'medium':
        return { color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: AlertTriangle, label: 'Medium Risk' };
      case 'high':
        return { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: ShieldAlert, label: 'High Risk' };
      case 'critical':
        return { color: 'text-red-600', bg: 'bg-red-600/15', border: 'border-red-600/40', icon: ShieldAlert, label: 'Critical' };
      default:
        return { color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: ShieldCheck, label: 'Safe' };
    }
  };

  const handleSend = async () => {
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }

    if (!toPhone) {
      setError('Please select or enter a phone number');
      return;
    }

    if (!fromNumber) {
      setError('Please select a from number');
      return;
    }

    setSending(true);
    setError('');

    try {
      const response = await fetch('/api/telnyx/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          to: toPhone,
          from: fromNumber,
          message: message,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      setSuccess(true);
      setMessage('');

      setTimeout(() => {
        setSuccess(false);
        onClose();
        onSuccess?.();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const characterCount = message.length;
  const smsCount = Math.ceil(characterCount / 160) || 1;

  const timezone = getTimezoneFromPhone(toPhone);
  const localTime = getLocalTime(timezone);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {leadName ? `Message to ${leadName}` : 'Send Message'}
            </h2>
            {localTime && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Local time: {localTime}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-500/50 text-red-300 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-sky-50 border border-sky-500/50 text-sky-300 px-4 py-3 rounded">
              Message sent successfully!
            </div>
          )}

          {/* From Number Selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              From Number
            </label>
            <select
              value={fromNumber}
              onChange={(e) => setFromNumber(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm text-slate-900 dark:text-slate-100"
              disabled={sending || success || loadingNumbers}
            >
              <option value="">
                {loadingNumbers ? 'Loading numbers...' : 'Select a number...'}
              </option>

              {/* Telnyx numbers from messaging profile */}
              {availableNumbers.length > 0 && (
                <>
                  {availableNumbers.map((num) => {
                    // Determine if toll-free based on area code (800, 888, 877, 866, 855, 844, 833)
                    const isTollFree = /^\+1(800|888|877|866|855|844|833)/.test(num.phone_number);
                    const numberType = isTollFree ? 'Toll-Free' : 'Local';

                    return (
                      <option key={num.phone_number} value={num.phone_number}>
                        {num.phone_number} - {numberType}{num.is_primary ? ' ★' : ''}
                      </option>
                    );
                  })}
                </>
              )}

              {/* Message if no numbers found */}
              {availableNumbers.length === 0 && !loadingNumbers && (
                <option value="" disabled>No numbers available</option>
              )}
            </select>
            {availableNumbers.length === 0 && !loadingNumbers && (
              <p className="text-xs text-gray-400 mt-2">
                No Telnyx numbers found. Add numbers to your messaging profile in the Telnyx portal.
              </p>
            )}
          </div>

          {/* To Phone Number Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              To Number
            </label>
            <input
              type="tel"
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value)}
              onBlur={(e) => setToPhone(formatPhoneE164(e.target.value))}
              placeholder="(555) 123-4567"
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              disabled={sending || success}
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              Message
            </label>
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={6}
                className={`w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-all ${
                  rephrasing
                    ? 'border-sky-400/50 ring-2 ring-sky-400/30 animate-pulse'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                disabled={sending || success || rephrasing}
              />
              {rephrasing && (
                <div className="absolute inset-0 bg-sky-500/10 rounded-md flex items-center justify-center backdrop-blur-[1px]">
                  <div className="bg-sky-500/90 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-200 animate-pulse" />
                    <span className="text-sm font-medium text-white">AI is rephrasing...</span>
                    <RefreshCw className="w-4 h-4 text-sky-200 animate-spin" />
                  </div>
                </div>
              )}
              {fixingSpam && (
                <div className="absolute inset-0 bg-orange-500/10 rounded-md flex items-center justify-center backdrop-blur-[1px]">
                  <div className="bg-orange-500/90 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-orange-200 animate-pulse" />
                    <span className="text-sm font-medium text-white">Fixing spam words...</span>
                    <RefreshCw className="w-4 h-4 text-orange-200 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Spam Detection Indicator */}
            {message.trim() && spamAnalysis && (
              <div className="mt-3">
                {(() => {
                  const indicator = getSpamIndicator();
                  const SpamIcon = indicator.icon;
                  return (
                    <div className={`${indicator.bg} ${indicator.border} border rounded-lg p-3 transition-all`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <SpamIcon className={`w-4 h-4 ${indicator.color}`} />
                          <span className={`text-sm font-medium ${indicator.color}`}>
                            Spam Score: {spamAnalysis.score}/100 - {indicator.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {spamAnalysis.score > 0 && (
                            <button
                              onClick={handleFixSpam}
                              disabled={fixingSpam || rephrasing || sending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-medium rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                              <Wand2 className={`w-3 h-3 ${fixingSpam ? 'animate-spin' : ''}`} />
                              {fixingSpam ? 'Fixing...' : 'Fix with AI'}
                            </button>
                          )}
                          {spamAnalysis.spamWords.length > 0 && (
                            <button
                              onClick={() => setShowSpamDetails(!showSpamDetails)}
                              className="text-xs text-gray-400 hover:text-gray-300 underline"
                            >
                              {showSpamDetails ? 'Hide' : 'Details'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Spam Details Dropdown */}
                      {showSpamDetails && spamAnalysis.spamWords.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-600/30">
                          <p className="text-xs text-gray-400 mb-2">Detected spam trigger words:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {spamAnalysis.spamWords.map((sw, idx) => (
                              <span
                                key={idx}
                                className={`px-2 py-0.5 text-xs rounded-full ${
                                  sw.severity === 'high'
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : sw.severity === 'medium'
                                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                }`}
                              >
                                {sw.word}
                              </span>
                            ))}
                          </div>
                          {spamAnalysis.patterns.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-400 mb-1">Suspicious patterns:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {spamAnalysis.patterns.slice(0, 5).map((pattern, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                  >
                                    {pattern.length > 20 ? pattern.substring(0, 17) + '...' : pattern}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* AI Rephrase Buttons */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => handleRephrase('shorter')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-200 text-sky-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message shorter"
              >
                <Minimize2 className="w-3 h-3" />
                Shorter
              </button>
              <button
                onClick={() => handleRephrase('longer')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-200 text-sky-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message longer"
              >
                <Maximize2 className="w-3 h-3" />
                Longer
              </button>
              <button
                onClick={() => handleRephrase('professional')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-200 text-sky-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message more professional"
              >
                <Briefcase className="w-3 h-3" />
                Professional
              </button>
              <button
                onClick={() => handleRephrase('rewrite')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-200 text-sky-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Rewrite message"
              >
                <RefreshCw className={`w-3 h-3 ${rephrasing ? 'animate-spin' : ''}`} />
                Rewrite
              </button>
              <div className={`flex items-center gap-1 text-xs ml-auto transition-all ${
                rephrasing ? 'text-sky-300' : 'text-sky-600/60'
              }`}>
                <Sparkles className={`w-3 h-3 ${rephrasing ? 'animate-pulse' : ''}`} />
                <span>{rephrasing ? 'Processing...' : 'AI'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
              <span>{characterCount} characters</span>
              <span>{smsCount} SMS</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || success}
            className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Message
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
