'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Sparkles, Minimize2, Maximize2, Briefcase, RefreshCw, Clock, AlertTriangle, Shield, ShieldCheck, ShieldAlert, Wand2, ChevronDown, FileText } from 'lucide-react';
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

// Quick reply templates for common messages
const QUICK_TEMPLATES = [
  {
    category: 'Initial Contact',
    templates: [
      { label: 'Introduction', text: 'Hi {name}! This is {agent} from HyveWyre. I wanted to reach out about your insurance quote request. When would be a good time to chat?' },
      { label: 'Follow-up', text: 'Hi {name}, just following up on your insurance inquiry. Do you have a few minutes to discuss your options?' },
    ]
  },
  {
    category: 'Scheduling',
    templates: [
      { label: 'Schedule Call', text: 'Hi {name}! I\'d love to go over your quote. Are you available for a quick call today or tomorrow?' },
      { label: 'Confirm Appointment', text: 'Hi {name}, just confirming our appointment for tomorrow. Looking forward to speaking with you!' },
      { label: 'Reschedule', text: 'Hi {name}, I need to reschedule our call. What other times work for you this week?' },
    ]
  },
  {
    category: 'Quick Replies',
    templates: [
      { label: 'Thank You', text: 'Thank you! I\'ll get that information over to you shortly.' },
      { label: 'Got It', text: 'Got it, thanks for letting me know!' },
      { label: 'Questions', text: 'Do you have any questions I can help answer?' },
      { label: 'More Info', text: 'I\'d be happy to provide more details. What specific information are you looking for?' },
    ]
  },
  {
    category: 'Closing',
    templates: [
      { label: 'Next Steps', text: 'Great! I\'ll send over the details and next steps shortly. Let me know if you have any questions!' },
      { label: 'Thanks for Business', text: 'Thank you for choosing us! Please don\'t hesitate to reach out if you need anything.' },
    ]
  }
];

interface Message {
  id: string;
  body?: string;
  content?: string;
  direction: 'inbound' | 'outbound' | 'in' | 'out';
  created_at: string;
}

interface SendSMSModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  leadPhone?: string;
  onSuccess?: () => void;
  // AI Response props
  generateAIResponse?: boolean;
  contextMessage?: string;
  conversationHistory?: Message[];
}

export default function SendSMSModal({
  isOpen,
  onClose,
  leadId,
  leadName = '',
  leadPhone,
  onSuccess,
  generateAIResponse = false,
  contextMessage,
  conversationHistory = [],
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
  const [showTemplates, setShowTemplates] = useState(false);

  // AI generation state
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);

  // Credits state
  const [userCredits, setUserCredits] = useState<number | null>(null);

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
      loadUserCredits();
      // Set or reset toPhone based on leadPhone prop, auto-format to E.164
      setToPhone(leadPhone ? formatPhoneE164(leadPhone) : '');
      setMessage('');
      setError('');
      setSuccess(false);
      setSpamAnalysis(null);
      setShowSpamDetails(false);
      // Reset AI state
      setAiSuggestions([]);
      setShowAiSuggestions(false);
      setGeneratingAI(false);
    }
  }, [isOpen, leadPhone]);

  const loadUserCredits = async () => {
    try {
      const res = await fetch('/api/user/credits');
      const data = await res.json();
      if (data.ok) {
        setUserCredits(data.credits);
      }
    } catch {
      // Silently fail - credits will remain null
    }
  };

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

  // Generate AI response based on conversation context
  const handleGenerateAIResponse = async () => {
    setGeneratingAI(true);
    setError('');
    setAiSuggestions([]);

    try {
      // If we have a leadId, use the smart-replies endpoint
      if (leadId) {
        const response = await fetch('/api/ai/smart-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.insufficientPoints) {
            throw new Error('Insufficient points. Please add more points to use AI features.');
          }
          throw new Error(data.error || 'Failed to generate AI response');
        }

        if (data.suggestions && data.suggestions.length > 0) {
          setAiSuggestions(data.suggestions);
          setShowAiSuggestions(true);
          // Auto-select the first suggestion
          setMessage(data.suggestions[0]);
        }
      } else {
        // No leadId - use direct AI endpoint with conversation context
        const isInbound = (dir: string) => dir === 'inbound' || dir === 'in';
        const conversationText = conversationHistory
          .slice(-5) // Last 5 messages for context
          .map(m => `${isInbound(m.direction) ? 'Customer' : 'Agent'}: ${m.body || m.content || ''}`)
          .join('\n');

        const lastInbound = contextMessage || conversationHistory
          .filter(m => isInbound(m.direction))
          .pop();
        const lastMessage = typeof lastInbound === 'string'
          ? lastInbound
          : (lastInbound?.body || lastInbound?.content || '');

        const prompt = `You are a helpful sales/customer service agent. Based on this conversation, generate 3 short, professional reply options to the customer's last message.

Conversation:
${conversationText}

${lastMessage ? `Customer's last message: "${lastMessage}"` : ''}

Provide exactly 3 reply suggestions, each on a new line. Keep them brief (under 160 characters for SMS). Be helpful and professional.`;

        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-4o-mini'
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Failed to generate AI response');
        }

        if (data.reply) {
          // Parse the 3 suggestions from the response
          const suggestions = data.reply
            .split('\n')
            .map((s: string) => s.replace(/^\d+[\.\)]\s*/, '').trim()) // Remove numbering
            .filter((s: string) => s.length > 0)
            .slice(0, 3);

          if (suggestions.length > 0) {
            setAiSuggestions(suggestions);
            setShowAiSuggestions(true);
            setMessage(suggestions[0]);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate AI response');
    } finally {
      setGeneratingAI(false);
    }
  };

  // Auto-generate AI response when modal opens with generateAIResponse flag
  useEffect(() => {
    if (isOpen && generateAIResponse && !message && !generatingAI) {
      handleGenerateAIResponse();
    }
  }, [isOpen, generateAIResponse]);

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

  // Insert template into message, replacing placeholders
  const insertTemplate = (templateText: string) => {
    let text = templateText;
    // Replace {name} with lead name if available
    if (leadName) {
      const firstName = leadName.split(' ')[0];
      text = text.replace(/{name}/g, firstName);
    } else {
      text = text.replace(/{name}/g, 'there');
    }
    // Replace {agent} with a placeholder (could be from user settings later)
    text = text.replace(/{agent}/g, 'your agent');
    setMessage(text);
    setShowTemplates(false);
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

    if (!hasEnoughCredits) {
      setError(`Insufficient credits. Need ${creditCost}, have ${userCredits || 0}`);
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
  const creditCost = smsCount; // 1 credit per SMS segment
  const hasEnoughCredits = userCredits === null || userCredits >= creditCost;

  const timezone = getTimezoneFromPhone(toPhone);
  const localTime = getLocalTime(timezone);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
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
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
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

          {/* Quick Templates */}
          <div>
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Quick Templates
              <ChevronDown className={`w-4 h-4 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
            </button>

            {showTemplates && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 max-h-48 overflow-y-auto">
                {QUICK_TEMPLATES.map((category) => (
                  <div key={category.category} className="mb-3 last:mb-0">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      {category.category}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {category.templates.map((template) => (
                        <button
                          key={template.label}
                          type="button"
                          onClick={() => insertTemplate(template.text)}
                          className="px-2.5 py-1 text-xs bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-md hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:border-sky-300 dark:hover:border-sky-500 text-slate-700 dark:text-slate-200 transition-all"
                          title={template.text}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Response Generator */}
          <div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleGenerateAIResponse}
                disabled={generatingAI || sending || success}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white text-sm font-medium rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {generatingAI ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate AI Reply
                  </>
                )}
              </button>
              {aiSuggestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAiSuggestions(!showAiSuggestions)}
                  className="text-xs text-purple-400 hover:text-purple-300"
                >
                  {showAiSuggestions ? 'Hide' : 'Show'} suggestions
                </button>
              )}
            </div>

            {/* AI Suggestions Panel */}
            {showAiSuggestions && aiSuggestions.length > 0 && (
              <div className="mt-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                <div className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  AI Suggestions (click to use)
                </div>
                <div className="space-y-2">
                  {aiSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setMessage(suggestion);
                        setShowAiSuggestions(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-md text-sm transition-all ${
                        message === suggestion
                          ? 'bg-violet-500/30 border-violet-400 text-white'
                          : 'bg-slate-700/50 hover:bg-violet-500/20 text-slate-200 hover:text-white'
                      } border border-slate-600 hover:border-violet-400`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAIResponse}
                  disabled={generatingAI}
                  className="mt-2 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${generatingAI ? 'animate-spin' : ''}`} />
                  Regenerate suggestions
                </button>
              </div>
            )}

            {/* Loading state for AI generation */}
            {generatingAI && (
              <div className="mt-3 p-4 bg-violet-500/10 border border-violet-500/30 rounded-lg flex items-center justify-center gap-3">
                <div className="animate-pulse flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-400 animate-bounce" />
                  <span className="text-sm text-violet-300">AI is crafting your response...</span>
                </div>
              </div>
            )}
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
              <div className="flex items-center gap-3">
                <span>{smsCount} SMS</span>
                {userCredits !== null && (
                  <span className={!hasEnoughCredits ? 'text-red-500 font-medium' : ''}>
                    {creditCost} credit{creditCost !== 1 ? 's' : ''} · {userCredits} available
                  </span>
                )}
              </div>
            </div>
            {!hasEnoughCredits && userCredits !== null && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-red-500">
                <AlertTriangle className="w-3.5 h-3.5" />
                Insufficient credits to send this message
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || success || !hasEnoughCredits}
            className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            title={!hasEnoughCredits ? 'Insufficient credits' : undefined}
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
