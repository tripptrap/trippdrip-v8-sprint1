'use client';

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';

/**
 * Consent capture for a business's branded opt-in page.
 *
 * The consent checkbox is intentionally: unchecked by default, separate from
 * any terms-of-service agreement, and required only to submit a phone number —
 * all three are Telnyx requirements (see docs/10DLC_REJECTION_HISTORY.md).
 */
export default function BrandedOptInForm({
  slug,
  businessName,
  consentText,
}: {
  slug: string;
  businessName: string;
  consentText: string;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (phone.replace(/\D/g, '').length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    if (!smsConsent) {
      setError('Please check the box to consent to receive SMS messages.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/opt-in/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: '+1' + phone.replace(/\D/g, ''),
          smsConsent: true,
          consentText,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Submission failed');
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-teal-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">You're signed up</h2>
        <p className="text-sm text-gray-600">
          Thanks! You'll receive text messages from {businessName} at the number you provided.
          Reply STOP at any time to opt out.
        </p>
      </div>
    );
  }

  const inputCls =
    'w-full px-4 py-2.5 rounded-lg bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium mb-1.5 text-gray-700">
            First Name
          </label>
          <input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)}
            required className={inputCls} placeholder="Jane" />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium mb-1.5 text-gray-700">
            Last Name
          </label>
          <input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)}
            required className={inputCls} placeholder="Smith" />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1.5 text-gray-700">
          Email <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
          className={inputCls} placeholder="jane@example.com" />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-1.5 text-gray-700">
          Mobile Phone Number
        </label>
        <input id="phone" type="tel" value={phone}
          onChange={e => setPhone(formatPhone(e.target.value))}
          required className={inputCls} placeholder="(555) 123-4567" />
      </div>

      {/* Unchecked by default, required, and separate from any ToS agreement */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 border border-gray-200">
        <input
          id="smsConsent"
          type="checkbox"
          checked={smsConsent}
          onChange={e => setSmsConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 shrink-0"
        />
        <label htmlFor="smsConsent" className="text-xs text-gray-700 leading-relaxed">
          {consentText}
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
      >
        {submitting ? 'Submitting…' : 'Sign Up'}
      </button>
    </form>
  );
}
