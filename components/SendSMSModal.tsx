'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, Minimize2, Maximize2, Briefcase, RefreshCw, Clock } from 'lucide-react';

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

  // Load user's Twilio phone numbers when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTwilioNumbers();
      // Set or reset toPhone based on leadPhone prop
      setToPhone(leadPhone || '');
      setMessage('');
      setError('');
      setSuccess(false);
    }
  }, [isOpen, leadPhone]);

  const loadTwilioNumbers = async () => {
    try {
      setLoadingNumbers(true);
      const response = await fetch('/api/twilio/numbers');
      const data = await response.json();

      if (data.success && data.numbers && data.numbers.length > 0) {
        setAvailableNumbers(data.numbers);
        // Auto-select primary number if available, otherwise select first number
        const primary = data.numbers.find((n: any) => n.is_primary);
        const numberToSelect = primary ? primary.phone_number : data.numbers[0].phone_number;
        setFromNumber(numberToSelect);
        console.log('Auto-selected number:', numberToSelect);
      } else {
        console.log('No numbers found:', data);
      }
    } catch (error) {
      console.error('Error loading Twilio numbers:', error);
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
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          toPhone: toPhone,
          from: fromNumber,
          messageBody: message,
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
      <div className="bg-[#1a1f2e] rounded-lg shadow-xl max-w-lg w-full border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">
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
            <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-900/20 border border-emerald-500/50 text-emerald-300 px-4 py-3 rounded">
              Message sent successfully!
            </div>
          )}

          {/* From Number Selector */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              From Number
            </label>
            <select
              value={fromNumber}
              onChange={(e) => setFromNumber(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0c1420] border border-white/20 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm text-white"
              disabled={sending || success || loadingNumbers}
            >
              <option value="">
                {loadingNumbers ? 'Loading numbers...' : 'Select a number...'}
              </option>

              {/* User's Twilio numbers from their subaccount */}
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

              {/* Fallback to master account numbers if user has no numbers */}
              {availableNumbers.length === 0 && !loadingNumbers && (
                <>
                  <option value="+18336587355">+1 (833) 658-7355 - Toll-Free (Master)</option>
                </>
              )}
            </select>
            {availableNumbers.length === 0 && !loadingNumbers && (
              <p className="text-xs text-gray-400 mt-2">
                Using master account numbers. Purchase your own numbers in Twilio to see them here.
              </p>
            )}
          </div>

          {/* To Phone Number Input */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              To Number
            </label>
            <input
              type="tel"
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value)}
              placeholder="+1234567890 or 1234567890"
              className="w-full px-3 py-2.5 bg-[#0c1420] border border-white/20 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm text-white placeholder-gray-500"
              disabled={sending || success}
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Message
            </label>
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={6}
                className={`w-full px-3 py-2.5 bg-[#0c1420] border rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none text-sm text-white placeholder-gray-500 transition-all ${
                  rephrasing
                    ? 'border-emerald-400/50 ring-2 ring-emerald-400/30 animate-pulse'
                    : 'border-white/20'
                }`}
                disabled={sending || success || rephrasing}
              />
              {rephrasing && (
                <div className="absolute inset-0 bg-emerald-400/10 rounded-md flex items-center justify-center backdrop-blur-[1px]">
                  <div className="bg-emerald-400/90 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse" />
                    <span className="text-sm font-medium text-white">AI is rephrasing...</span>
                    <RefreshCw className="w-4 h-4 text-emerald-200 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* AI Rephrase Buttons */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => handleRephrase('shorter')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/20 hover:bg-emerald-400/30 border border-emerald-400/30 text-emerald-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message shorter"
              >
                <Minimize2 className="w-3 h-3" />
                Shorter
              </button>
              <button
                onClick={() => handleRephrase('longer')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/20 hover:bg-emerald-400/30 border border-emerald-400/30 text-emerald-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message longer"
              >
                <Maximize2 className="w-3 h-3" />
                Longer
              </button>
              <button
                onClick={() => handleRephrase('professional')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/20 hover:bg-emerald-400/30 border border-emerald-400/30 text-emerald-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message more professional"
              >
                <Briefcase className="w-3 h-3" />
                Professional
              </button>
              <button
                onClick={() => handleRephrase('rewrite')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/20 hover:bg-emerald-400/30 border border-emerald-400/30 text-emerald-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Rewrite message"
              >
                <RefreshCw className={`w-3 h-3 ${rephrasing ? 'animate-spin' : ''}`} />
                Rewrite
              </button>
              <div className={`flex items-center gap-1 text-xs ml-auto transition-all ${
                rephrasing ? 'text-emerald-300' : 'text-emerald-400/60'
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-[#0f1419]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 rounded-md transition-colors"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || success}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
