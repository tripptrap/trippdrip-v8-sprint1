'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader2 } from 'lucide-react';

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

  // Load user's Twilio phone numbers when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTwilioNumbers();
    }
  }, [isOpen]);

  const loadTwilioNumbers = async () => {
    try {
      setLoadingNumbers(true);
      const response = await fetch('/api/twilio/numbers');
      const data = await response.json();

      if (data.success && data.numbers && data.numbers.length > 0) {
        setAvailableNumbers(data.numbers);
        // Auto-select primary number if available
        const primary = data.numbers.find((n: any) => n.is_primary);
        if (primary && !fromNumber) {
          setFromNumber(primary.phone_number);
        }
      }
    } catch (error) {
      console.error('Error loading Twilio numbers:', error);
    } finally {
      setLoadingNumbers(false);
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
                  {availableNumbers.map((num) => (
                    <option key={num.phone_number} value={num.phone_number}>
                      {num.phone_number} {num.friendly_name ? `(${num.friendly_name})` : ''} {num.is_primary ? '★' : ''}
                    </option>
                  ))}
                </>
              )}

              {/* Fallback to master account numbers if user has no numbers */}
              {availableNumbers.length === 0 && !loadingNumbers && (
                <>
                  <option value="+18336587355">+1 (833) 658-7355 (SMS - Master)</option>
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
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={6}
              className="w-full px-3 py-2.5 bg-[#0c1420] border border-white/20 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm text-white placeholder-gray-500"
              disabled={sending || success}
            />
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
