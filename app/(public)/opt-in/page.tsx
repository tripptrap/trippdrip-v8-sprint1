'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle } from 'lucide-react';

/**
 * SMS Opt-In Form
 * This form serves as proof of consent collection for Telnyx toll-free verification.
 * It captures explicit SMS consent with all required TCPA/CTIA compliance disclosures.
 */
export default function ContactFormPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    smsConsent: false,
    emailOptIn: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData(prev => ({
      ...prev,
      phone: formatted,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.firstName.trim()) {
      setError('First name is required');
      return;
    }
    if (!formData.lastName.trim()) {
      setError('Last name is required');
      return;
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Valid email address is required');
      return;
    }
    if (!formData.phone.trim() || formData.phone.replace(/\D/g, '').length < 10) {
      setError('Valid phone number is required');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/contact-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim(),
          phone: '+1' + formData.phone.replace(/\D/g, ''),
          smsConsent: formData.smsConsent,
          emailOptIn: formData.emailOptIn,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit form');
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-600 mb-6">
            Your information has been submitted successfully. One of our representatives will reach out to you shortly.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-lg w-full">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">HW</span>
          </div>
          <span className="text-xl font-bold text-gray-900">HyveWyre</span>
        </div>

        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-teal-600 bg-white border border-teal-200 rounded-full mb-4">
          Contact Form
        </span>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Get in Touch</h1>
        <p className="text-gray-600 mb-6">
          Fill out the form below and one of our representatives will reach out to you shortly.
        </p>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="John"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Smith"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@example.com"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handlePhoneChange}
              placeholder="(555) 123-4567"
              maxLength={14}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            />
          </div>

          {/* SMS Consent - Required for Toll-Free Verification */}
          <div className="bg-teal-50 border-2 border-teal-300 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="smsConsent"
                checked={formData.smsConsent}
                onChange={handleChange}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <div className="text-sm text-gray-700">
                <p>
                  <span className="font-semibold text-gray-900">SMS Consent:</span>{' '}
                  By checking this box, I agree to receive SMS text messages from my sales representative.
                  Message frequency varies. Message and data rates may apply.
                  Reply <span className="font-bold">STOP</span> to unsubscribe at any time.
                  Reply <span className="font-bold">HELP</span> for assistance.
                  View our{' '}
                  <Link href="/privacy" className="text-teal-600 hover:text-teal-700">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/terms" className="text-teal-600 hover:text-teal-700">
                    Terms of Service
                  </Link>.
                </p>
              </div>
            </label>
          </div>

          {/* Email Opt-in */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="emailOptIn"
                checked={formData.emailOptIn}
                onChange={handleChange}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">
                I would also like to receive email updates and promotional offers.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          By submitting this form, you agree to our{' '}
          <Link href="/privacy" className="text-teal-600 hover:text-teal-700 underline">
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link href="/terms" className="text-teal-600 hover:text-teal-700 underline">
            Terms of Service
          </Link>.
        </p>

        {/* Compliance Information for Toll-Free Verification */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-center text-xs text-gray-400 space-y-1">
            <p className="font-medium text-gray-500">SMS Program Information</p>
            <p>Program: HyveWyre SMS Communications</p>
            <p>Message Types: Promotional, Informational, Transactional</p>
            <p>Message Frequency: Varies based on user interaction</p>
            <p>Carrier Disclaimer: Message and data rates may apply</p>
            <p>Opt-Out: Reply STOP to unsubscribe | Opt-In: Reply START to resubscribe</p>
            <p>Support: support@hyvewyre.com | Text HELP for assistance</p>
          </div>
        </div>
      </div>
    </div>
  );
}
