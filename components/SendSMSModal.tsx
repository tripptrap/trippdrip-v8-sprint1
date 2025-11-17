'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, Minimize2, Maximize2, Briefcase, RefreshCw } from 'lucide-react';

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
      // Reset form when modal opens
      if (!leadPhone) {
        setToPhone('');
      }
      setMessage('');
      setError('');
      setSuccess(false);
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] rounded-lg shadow-xl max-w-lg w-full border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Send Message
            </h2>
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
            <div className="bg-green-900/20 border border-green-500/50 text-green-300 px-4 py-3 rounded">
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
              className="w-full px-3 py-2.5 bg-[#0c1420] border border-white/20 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-white"
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
              className="w-full px-3 py-2.5 bg-[#0c1420] border border-white/20 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-white placeholder-gray-500"
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
                className={`w-full px-3 py-2.5 bg-[#0c1420] border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm text-white placeholder-gray-500 transition-all ${
                  rephrasing
                    ? 'border-purple-500/50 ring-2 ring-purple-500/30 animate-pulse'
                    : 'border-white/20'
                }`}
                disabled={sending || success || rephrasing}
              />
              {rephrasing && (
                <div className="absolute inset-0 bg-purple-500/10 rounded-md flex items-center justify-center backdrop-blur-[1px]">
                  <div className="bg-purple-600/90 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-200 animate-pulse" />
                    <span className="text-sm font-medium text-white">AI is rephrasing...</span>
                    <RefreshCw className="w-4 h-4 text-purple-200 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* AI Rephrase Buttons */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => handleRephrase('shorter')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message shorter"
              >
                <Minimize2 className="w-3 h-3" />
                Shorter
              </button>
              <button
                onClick={() => handleRephrase('longer')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message longer"
              >
                <Maximize2 className="w-3 h-3" />
                Longer
              </button>
              <button
                onClick={() => handleRephrase('professional')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Make message more professional"
              >
                <Briefcase className="w-3 h-3" />
                Professional
              </button>
              <button
                onClick={() => handleRephrase('rewrite')}
                disabled={!message.trim() || rephrasing || sending || success}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                title="Rewrite message"
              >
                <RefreshCw className={`w-3 h-3 ${rephrasing ? 'animate-spin' : ''}`} />
                Rewrite
              </button>
              <div className={`flex items-center gap-1 text-xs ml-auto transition-all ${
                rephrasing ? 'text-purple-300' : 'text-purple-400/60'
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
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
