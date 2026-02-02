"use client";

import { useState } from 'react';

interface OptOutGateModalProps {
  onConfigured: (keyword: string) => void;
}

export default function OptOutGateModal({ onConfigured }: OptOutGateModalProps) {
  const [keyword, setKeyword] = useState('STOP');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = keyword.trim().toUpperCase();
    if (!trimmed) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optOutKeyword: trimmed }),
      });

      if (res.ok) {
        onConfigured(trimmed);
      } else {
        setError('Failed to save. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Set Up Opt-Out Keyword
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Required before sending messages</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Federal regulations require an opt-out option in your first message to each contact.
          Set a keyword that recipients can reply with to stop receiving messages.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Opt-Out Keyword
          </label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value.toUpperCase())}
            placeholder="e.g. STOP"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && keyword.trim()) {
                handleSave();
              }
            }}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            First messages will include: &quot;Reply {keyword || 'STOP'} to opt out&quot;
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-500 mb-3">{error}</p>
        )}

        <button
          disabled={!keyword.trim() || saving}
          onClick={handleSave}
          className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}
