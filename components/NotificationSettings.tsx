'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Check, X, AlertTriangle, Play } from 'lucide-react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  NotificationType,
  NOTIFICATION_TYPE_LABELS,
  isNotificationSupported,
} from '@/lib/notifications';

export default function NotificationSettings() {
  const {
    preferences,
    permission,
    isLoaded,
    updatePreferences,
    updateTypePreference,
    requestPermission,
    playTestSound,
  } = useNotifications();

  const [testPlaying, setTestPlaying] = useState(false);

  const handleTestSound = () => {
    setTestPlaying(true);
    playTestSound();
    setTimeout(() => setTestPlaying(false), 1000);
  };

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      // Show a test notification
      new Notification('Notifications Enabled', {
        body: 'You will now receive browser notifications from HyveWyre',
        icon: '/logo-basic.png',
      });
    }
  };

  if (!isLoaded) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
      </div>
    );
  }

  const notSupported = !isNotificationSupported();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Browser Notifications</h2>
        <p className="text-slate-600 dark:text-slate-400">
          Get notified when important events happen, even when the app is in the background.
        </p>
      </div>

      {/* Browser Support Warning */}
      {notSupported && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">Browser Not Supported</span>
          </div>
          <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
            Your browser doesn't support notifications. Try using Chrome, Firefox, or Edge.
          </p>
        </div>
      )}

      {/* Permission Request */}
      {!notSupported && permission !== 'granted' && (
        <div className="p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400">
                <Bell className="w-5 h-5" />
                <span className="font-medium">
                  {permission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
                </span>
              </div>
              <p className="text-sm text-sky-600 dark:text-sky-500 mt-1">
                {permission === 'denied'
                  ? 'Notifications are blocked. Please enable them in your browser settings.'
                  : 'Allow browser notifications to stay updated on new messages and events.'}
              </p>
            </div>
            {permission !== 'denied' && (
              <button
                onClick={handleRequestPermission}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
              >
                Enable
              </button>
            )}
          </div>
        </div>
      )}

      {/* Permission Granted Badge */}
      {!notSupported && permission === 'granted' && (
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
          <Check className="w-4 h-4" />
          <span>Browser notifications enabled</span>
        </div>
      )}

      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          {preferences.enabled ? (
            <Bell className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          ) : (
            <BellOff className="w-5 h-5 text-slate-400" />
          )}
          <div>
            <h3 className="font-medium">Enable Notifications</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Receive browser notifications for selected events
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={preferences.enabled}
            onChange={(e) => updatePreferences({ enabled: e.target.checked })}
            disabled={notSupported}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500 peer-disabled:opacity-50"></div>
        </label>
      </div>

      {/* Sound Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
          Sound Settings
        </h3>

        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            {preferences.sound ? (
              <Volume2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            ) : (
              <VolumeX className="w-5 h-5 text-slate-400" />
            )}
            <div>
              <h3 className="font-medium">Notification Sound</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Play a sound when notifications arrive
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.sound}
              onChange={(e) => updatePreferences({ sound: e.target.checked })}
              disabled={!preferences.enabled}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500 peer-disabled:opacity-50"></div>
          </label>
        </div>

        {preferences.sound && preferences.enabled && (
          <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">
                Volume: {preferences.soundVolume}%
              </label>
              <button
                onClick={handleTestSound}
                disabled={testPlaying}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${testPlaying ? 'animate-pulse' : ''}`} />
                Test Sound
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={preferences.soundVolume}
              onChange={(e) => updatePreferences({ soundVolume: Number(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Mute</span>
              <span>Max</span>
            </div>
          </div>
        )}
      </div>

      {/* Notification Types */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
          Notification Types
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Choose which events trigger notifications.
        </p>

        <div className="space-y-2">
          {(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((type) => {
            const { label, description } = NOTIFICATION_TYPE_LABELS[type];
            const isEnabled = preferences.types[type];

            return (
              <div
                key={type}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  isEnabled && preferences.enabled
                    ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50'
                }`}
              >
                <div className={!preferences.enabled ? 'opacity-50' : ''}>
                  <h4 className="font-medium text-sm">{label}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => updateTypePreference(type, e.target.checked)}
                    disabled={!preferences.enabled}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500 peer-disabled:opacity-50"></div>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">Tips</h4>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
          <li>Keep the browser tab open to receive notifications</li>
          <li>Notifications work even when the tab is in the background</li>
          <li>Sound will play based on your volume setting above</li>
          <li>Click a notification to jump to the relevant item</li>
        </ul>
      </div>
    </div>
  );
}
