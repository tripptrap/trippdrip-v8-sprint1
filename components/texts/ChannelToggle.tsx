"use client";

interface ChannelToggleProps {
  channel: 'sms' | 'whatsapp';
  onChange: (channel: 'sms' | 'whatsapp') => void;
}

export default function ChannelToggle({ channel, onChange }: ChannelToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-700/50 p-0.5">
      <button
        onClick={() => onChange('sms')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          channel === 'sms'
            ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        SMS
      </button>
      <button
        onClick={() => onChange('whatsapp')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          channel === 'whatsapp'
            ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        WhatsApp
      </button>
    </div>
  );
}
