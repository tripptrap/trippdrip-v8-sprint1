'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ReceptionistSettings as ReceptionistSettingsType, DEFAULT_RECEPTIONIST_SETTINGS, DEFAULT_SYSTEM_PROMPT } from '@/lib/receptionist/types';
import { Headphones, MessageSquare, Clock, Users, Calendar, Zap, Shield, ChevronDown } from 'lucide-react';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export default function ReceptionistSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');

  // Business hours
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(true);
  const [businessHoursStart, setBusinessHoursStart] = useState('09:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState('17:00');
  const [businessHoursTimezone, setBusinessHoursTimezone] = useState('America/New_York');
  const [businessDays, setBusinessDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [afterHoursMessage, setAfterHoursMessage] = useState('');

  // Response settings
  const [respondToSoldClients, setRespondToSoldClients] = useState(true);
  const [respondToNewContacts, setRespondToNewContacts] = useState(true);
  const [autoCreateLeads, setAutoCreateLeads] = useState(true);

  // Calendar
  const [calendarEnabled, setCalendarEnabled] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/receptionist/settings');
      const data = await response.json();

      if (data.success) {
        setHasSettings(data.hasSettings);

        const settings = data.settings;
        setEnabled(settings.enabled || false);
        setSystemPrompt(settings.system_prompt || '');
        setGreetingMessage(settings.greeting_message || DEFAULT_RECEPTIONIST_SETTINGS.greeting_message || '');

        setBusinessHoursEnabled(settings.business_hours_enabled ?? true);
        setBusinessHoursStart(settings.business_hours_start?.substring(0, 5) || '09:00');
        setBusinessHoursEnd(settings.business_hours_end?.substring(0, 5) || '17:00');
        setBusinessHoursTimezone(settings.business_hours_timezone || 'America/New_York');
        setBusinessDays(settings.business_days || [1, 2, 3, 4, 5]);
        setAfterHoursMessage(settings.after_hours_message || '');

        setRespondToSoldClients(settings.respond_to_sold_clients ?? true);
        setRespondToNewContacts(settings.respond_to_new_contacts ?? true);
        setAutoCreateLeads(settings.auto_create_leads ?? true);

        setCalendarEnabled(settings.calendar_enabled ?? false);
      }
    } catch (error) {
      console.error('Error loading receptionist settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/receptionist/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          system_prompt: systemPrompt || null,
          greeting_message: greetingMessage,
          business_hours_enabled: businessHoursEnabled,
          business_hours_start: businessHoursStart + ':00',
          business_hours_end: businessHoursEnd + ':00',
          business_hours_timezone: businessHoursTimezone,
          business_days: businessDays,
          after_hours_message: afterHoursMessage || null,
          respond_to_sold_clients: respondToSoldClients,
          respond_to_new_contacts: respondToNewContacts,
          auto_create_leads: autoCreateLeads,
          calendar_enabled: calendarEnabled,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message || 'Settings saved successfully');
        setHasSettings(true);
      } else if (data.upgradeRequired) {
        toast.error('Premium subscription required');
      } else {
        toast.error(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    if (businessDays.includes(day)) {
      setBusinessDays(businessDays.filter(d => d !== day));
    } else {
      setBusinessDays([...businessDays, day].sort((a, b) => a - b));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save Button (Top) */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Enable Toggle */}
      <div className="card bg-gradient-to-br from-sky-50 to-teal-50 dark:from-sky-900/20 dark:to-teal-900/20 border border-sky-200 dark:border-sky-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Enable AI Receptionist</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Automatically respond to incoming messages from configured contact types
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-sky-500 peer-checked:to-teal-500"></div>
          </label>
        </div>

        {enabled && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Receptionist is active and will respond to incoming messages</span>
            </div>
          </div>
        )}
      </div>

      {/* Personality & Prompt */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Personality & Prompt</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Custom Instructions (Optional)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            rows={6}
            className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Describe your business, services, and how you want the AI to respond. Leave blank to use the default prompt.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Greeting Message for New Contacts
          </label>
          <input
            type="text"
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
            placeholder="Hi! Thanks for reaching out. How can I help you today?"
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Business Hours */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Business Hours</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Set when the receptionist should respond normally vs. send after-hours messages
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={businessHoursEnabled}
              onChange={(e) => setBusinessHoursEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
          </label>
        </div>

        {businessHoursEnabled && (
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Start Time
                </label>
                <input
                  type="time"
                  value={businessHoursStart}
                  onChange={(e) => setBusinessHoursStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={businessHoursEnd}
                  onChange={(e) => setBusinessHoursEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Timezone
                </label>
                <select
                  value={businessHoursTimezone}
                  onChange={(e) => setBusinessHoursTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Business Days
              </label>
              <div className="flex gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                      businessDays.includes(day.value)
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                After Hours Message
              </label>
              <textarea
                value={afterHoursMessage}
                onChange={(e) => setAfterHoursMessage(e.target.value)}
                placeholder="Thanks for reaching out! We're currently closed. We'll get back to you during business hours."
                rows={2}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Response Settings */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
            <Users className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Response Settings</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-100">Respond to Sold Clients</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                AI will respond to messages from leads marked as "sold" or "closed won"
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={respondToSoldClients}
                onChange={(e) => setRespondToSoldClients(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-100">Respond to New Contacts</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                AI will respond to messages from unknown phone numbers
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={respondToNewContacts}
                onChange={(e) => setRespondToNewContacts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-100">Auto-Create Leads</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Automatically create a lead record for new contacts who text you
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoCreateLeads}
                onChange={(e) => setAutoCreateLeads(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Calendar Integration */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Calendar Integration</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Enable appointment scheduling through the receptionist
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={calendarEnabled}
              onChange={(e) => setCalendarEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
          </label>
        </div>

        {calendarEnabled && (
          <div className="p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
            <p className="text-sm text-sky-700 dark:text-sky-400">
              When enabled, the receptionist can help contacts schedule appointments.
              Make sure you have connected your Google Calendar in the{' '}
              <a href="/integrations" className="underline font-medium hover:no-underline">
                Integrations
              </a>{' '}
              settings.
            </p>
          </div>
        )}
      </div>

      {/* Usage Info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
            <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Usage & Pricing</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20 border border-sky-200 dark:border-sky-700/50 rounded-xl text-center">
            <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center mx-auto mb-2">
              <Zap className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">2</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Points per AI response</div>
          </div>
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl text-center">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-2">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">0</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Points for after-hours messages</div>
          </div>
          <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl text-center">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mx-auto mb-2">
              <MessageSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">1</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Point per SMS sent</div>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Each receptionist response uses 2 points for AI generation plus 1 point for sending the SMS.
          After-hours automated messages only cost 1 point (no AI generation).
        </p>
      </div>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-8 py-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
