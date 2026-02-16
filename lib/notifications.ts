// Browser Notification System with Sound Alerts

export type NotificationType =
  | 'new_message'
  | 'lead_response'
  | 'campaign_completed'
  | 'low_credits'
  | 'appointment_reminder'
  | 'drip_completed'
  | 'ai_response';

export interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  soundVolume: number; // 0-100
  types: {
    new_message: boolean;
    lead_response: boolean;
    campaign_completed: boolean;
    low_credits: boolean;
    appointment_reminder: boolean;
    drip_completed: boolean;
    ai_response: boolean;
  };
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  sound: true,
  soundVolume: 50,
  types: {
    new_message: true,
    lead_response: true,
    campaign_completed: true,
    low_credits: true,
    appointment_reminder: true,
    drip_completed: true,
    ai_response: false,
  },
};

export const NOTIFICATION_CONFIG: Record<NotificationType, {
  title: string;
  icon: string;
  sound: string;
  tag: string;
}> = {
  new_message: {
    title: 'New Message',
    icon: '/logo-basic.png',
    sound: '/sounds/notification.wav',
    tag: 'new-message',
  },
  lead_response: {
    title: 'Lead Responded',
    icon: '/logo-basic.png',
    sound: '/sounds/notification.wav',
    tag: 'lead-response',
  },
  campaign_completed: {
    title: 'Campaign Completed',
    icon: '/logo-basic.png',
    sound: '/sounds/notification.wav',
    tag: 'campaign',
  },
  low_credits: {
    title: 'Low Credits Warning',
    icon: '/logo-basic.png',
    sound: '/sounds/notification.wav',
    tag: 'credits',
  },
  appointment_reminder: {
    title: 'Appointment Reminder',
    icon: '/logo-basic.png',
    sound: '/sounds/notification.wav',
    tag: 'appointment',
  },
  drip_completed: {
    title: 'Drip Campaign Finished',
    icon: '/logo-basic.png',
    sound: '/sounds/notification.wav',
    tag: 'drip',
  },
  ai_response: {
    title: 'AI Response Ready',
    icon: '/logo-basic.png',
    sound: '/sounds/notification.wav',
    tag: 'ai',
  },
};

// Storage key for preferences
const PREFS_KEY = 'hyvewyre_notification_prefs';

// Load preferences from localStorage
export function loadNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_PREFERENCES;

  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...parsed };
    }
  } catch (e) {
    console.error('Error loading notification preferences:', e);
  }

  return DEFAULT_NOTIFICATION_PREFERENCES;
}

// Save preferences to localStorage
export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('notificationPrefsChanged', { detail: prefs }));
  } catch (e) {
    console.error('Error saving notification preferences:', e);
  }
}

// Check if browser notifications are supported
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Get current notification permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    console.error('Error requesting notification permission:', e);
    return 'denied';
  }
}

// Generate a notification tone using Web Audio API (fallback)
function playGeneratedTone(volume: number): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Pleasant notification sound: two-tone chime
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator.frequency.setValueAtTime(1047, audioContext.currentTime + 0.1); // C6

    gainNode.gain.setValueAtTime(volume / 100 * 0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log('Web Audio fallback failed:', e);
  }
}

// Play notification sound
export function playNotificationSound(soundUrl: string, volume: number = 50): void {
  if (typeof window === 'undefined') return;

  try {
    const audio = new Audio(soundUrl);
    audio.volume = Math.max(0, Math.min(1, volume / 100));

    audio.play().catch(() => {
      // If audio file fails, try Web Audio API fallback
      playGeneratedTone(volume);
    });

    // Also handle error event for network failures
    audio.onerror = () => {
      playGeneratedTone(volume);
    };
  } catch (e) {
    // Last resort: try generated tone
    playGeneratedTone(volume);
  }
}

// Send a browser notification
export async function sendNotification(
  type: NotificationType,
  body: string,
  options?: {
    onClick?: () => void;
    data?: any;
  }
): Promise<boolean> {
  const prefs = loadNotificationPreferences();

  // Check if notifications are enabled globally and for this type
  if (!prefs.enabled || !prefs.types[type]) {
    return false;
  }

  const config = NOTIFICATION_CONFIG[type];

  // Play sound if enabled
  if (prefs.sound) {
    playNotificationSound(config.sound, prefs.soundVolume);
  }

  // Check browser notification permission
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notification = new Notification(config.title, {
      body,
      icon: config.icon,
      tag: config.tag,
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    return true;
  } catch (e) {
    console.error('Error sending notification:', e);
    return false;
  }
}

// Notification type labels for UI
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { label: string; description: string }> = {
  new_message: {
    label: 'New Messages',
    description: 'When you receive a new SMS message',
  },
  lead_response: {
    label: 'Lead Responses',
    description: 'When a lead replies to your message',
  },
  campaign_completed: {
    label: 'Campaign Completed',
    description: 'When a campaign finishes sending',
  },
  low_credits: {
    label: 'Low Credits',
    description: 'When your credit balance is low',
  },
  appointment_reminder: {
    label: 'Appointment Reminders',
    description: 'Reminders for upcoming appointments',
  },
  drip_completed: {
    label: 'Drip Completed',
    description: 'When an AI drip sequence finishes',
  },
  ai_response: {
    label: 'AI Responses',
    description: 'When AI generates a response',
  },
};
