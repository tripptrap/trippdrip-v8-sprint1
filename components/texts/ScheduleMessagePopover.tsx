"use client";

import { useState } from 'react';
import { Calendar, Clock, X } from 'lucide-react';

interface ScheduleMessagePopoverProps {
  onSchedule: (scheduledFor: string) => void;
  onCancel: () => void;
}

export default function ScheduleMessagePopover({ onSchedule, onCancel }: ScheduleMessagePopoverProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const today = new Date().toISOString().split('T')[0];

  function handleConfirm() {
    if (!date || !time) return;

    const scheduledFor = `${date}T${time}:00`;
    const scheduledDate = new Date(scheduledFor);

    if (scheduledDate <= new Date()) {
      return; // Must be in the future
    }

    onSchedule(scheduledFor);
  }

  const isValid = date && time && new Date(`${date}T${time}:00`) > new Date();

  return (
    <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 p-3 w-64 z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Schedule Message</span>
        <button onClick={onCancel} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-600 rounded">
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={today}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 [color-scheme:dark]"
          />
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={!isValid}
        className="w-full mt-3 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
      >
        Confirm Schedule
      </button>
    </div>
  );
}
