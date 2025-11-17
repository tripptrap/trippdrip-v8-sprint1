'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export default function DemoModeBanner() {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if demo mode is enabled
    const demoMode = localStorage.getItem('demo_mode') === 'true';
    setIsDemoMode(demoMode);

    // Check if banner was dismissed this session
    const wasDismissed = sessionStorage.getItem('demo_banner_dismissed') === 'true';
    setDismissed(wasDismissed);
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('demo_banner_dismissed', 'true');
    setDismissed(true);
  };

  if (!isDemoMode || dismissed) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎭</span>
          <div>
            <div className="font-semibold text-sm">Demo Mode Active</div>
            <div className="text-xs text-white/90">
              You're viewing sample data. Go to Settings &gt; Account to disable.
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="hover:bg-white/20 rounded-full p-1 transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
