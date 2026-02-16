'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  NotificationPreferences,
  NotificationType,
  loadNotificationPreferences,
  saveNotificationPreferences,
  requestNotificationPermission,
  getNotificationPermission,
  sendNotification,
  playNotificationSound,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/lib/notifications';

export function useNotifications() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences and permission on mount
  useEffect(() => {
    const prefs = loadNotificationPreferences();
    setPreferences(prefs);
    setPermission(getNotificationPermission());
    setIsLoaded(true);

    // Listen for preference changes from other tabs/components
    const handlePrefsChange = (e: CustomEvent<NotificationPreferences>) => {
      setPreferences(e.detail);
    };

    window.addEventListener('notificationPrefsChanged', handlePrefsChange as EventListener);
    return () => {
      window.removeEventListener('notificationPrefsChanged', handlePrefsChange as EventListener);
    };
  }, []);

  // Update preferences
  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setPreferences(prev => {
      const newPrefs = { ...prev, ...updates };
      saveNotificationPreferences(newPrefs);
      return newPrefs;
    });
  }, []);

  // Update a specific notification type
  const updateTypePreference = useCallback((type: NotificationType, enabled: boolean) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        types: { ...prev.types, [type]: enabled },
      };
      saveNotificationPreferences(newPrefs);
      return newPrefs;
    });
  }, []);

  // Request permission
  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  // Send a notification
  const notify = useCallback(async (
    type: NotificationType,
    body: string,
    options?: { onClick?: () => void; data?: any }
  ) => {
    return sendNotification(type, body, options);
  }, []);

  // Play test sound
  const playTestSound = useCallback((volume?: number) => {
    playNotificationSound('/sounds/notification.wav', volume ?? preferences.soundVolume);
  }, [preferences.soundVolume]);

  return {
    preferences,
    permission,
    isLoaded,
    updatePreferences,
    updateTypePreference,
    requestPermission,
    notify,
    playTestSound,
  };
}
