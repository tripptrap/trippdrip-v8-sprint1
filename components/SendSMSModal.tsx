'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader2, FileText } from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  steps: Array<{ delay: number; message: string }>;
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
  leadName,
  leadPhone,
  onSuccess,
}: SendSMSModalProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [fromNumber, setFromNumber] = useState('');
  const [toPhone, setToPhone] = useState(leadPhone || '');

  // Load campaigns/flows when modal opens
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      loadCampaigns();
    }
  }, [isOpen]);

  const loadCampaigns = async () => {
    if (typeof window === 'undefined') return;

    setLoadingCampaigns(true);
    try {
      const response = await fetch('/api/campaigns');
      const data = await response.json();
      if (data.ok && data.campaigns) {
        setCampaigns(data.campaigns);
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      // Don't show error to user for campaigns loading failure
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const handleTemplateSelect = (campaignId: string) => {
    setSelectedCampaign(campaignId);
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign && campaign.steps && campaign.steps.length > 0) {
      // Use the first step's message as the template
      setMessage(campaign.steps[0].message || '');
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
              disabled={sending || success}
            >
              <option value="">Select a number...</option>
              <option value="+18336587355">+1 (833) 658-7355 (SMS)</option>
              <option value="whatsapp:+15558917942">+1 (555) 891-7942 (WhatsApp)</option>
            </select>
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

          {/* Template/Flow Selector */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Use Campaign Flow (Optional)
            </label>
            <select
              value={selectedCampaign}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0c1420] border border-white/20 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-white"
              disabled={sending || success || loadingCampaigns}
            >
              <option value=""></option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here or select a campaign flow above..."
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
