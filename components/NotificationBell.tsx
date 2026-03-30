"use client";

import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, MessageSquare, Zap, UserMinus, Calendar, Bot, Megaphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
  data?: Record<string, any>;
  created_at: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  new_message: MessageSquare,
  lead_reply: MessageSquare,
  opt_out: UserMinus,
  low_credits: Zap,
  appointment: Calendar,
  campaign_done: Megaphone,
  ai_handoff: Bot,
};

const TYPE_COLOR: Record<string, string> = {
  new_message: 'text-sky-400',
  lead_reply: 'text-sky-400',
  opt_out: 'text-red-400',
  low_credits: 'text-amber-400',
  appointment: 'text-emerald-400',
  campaign_done: 'text-violet-400',
  ai_handoff: 'text-violet-400',
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications?limit=15');
      const data = await res.json();
      if (data.ok) {
        setNotifications(data.notifications);
        setUnreadCount(data.notifications.filter((n: AppNotification) => !n.is_read).length);
      }
    } catch {
      // Silently fail — bell still renders without data
    }
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#0e1623] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl shadow-black/20 dark:shadow-black/40 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICON[n.type] || Bell;
                const iconColor = TYPE_COLOR[n.type] || 'text-slate-400';
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                      !n.is_read ? 'bg-sky-50/60 dark:bg-slate-800/30' : ''
                    }`}
                    onClick={() => !n.is_read && markRead(n.id)}
                  >
                    <div className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${
                        n.is_read
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-slate-900 dark:text-slate-100 font-medium'
                      }`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 truncate">{n.body}</p>
                      )}
                      <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 text-center">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Showing last {notifications.length} notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
