'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface OnboardingState {
  phone_selected: boolean;
  theme_selected: boolean;
  tour_completed: boolean;
  completed: boolean;
}

interface OnboardingContextType {
  state: OnboardingState;
  loading: boolean;
  updateState: (updates: Partial<OnboardingState>) => Promise<void>;
}

const DEFAULT_STATE: OnboardingState = {
  phone_selected: false,
  theme_selected: false,
  tour_completed: false,
  completed: false,
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('/api/user/onboarding');
        const data = await res.json();
        if (data.ok && data.state) {
          setState(data.state);
        }
      } catch {
        // Keep defaults
      } finally {
        setLoading(false);
      }
    };
    fetchState();
  }, []);

  const updateState = useCallback(async (updates: Partial<OnboardingState>) => {
    // Optimistic update
    setState(prev => ({ ...prev, ...updates }));

    try {
      const res = await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.ok && data.state) {
        setState(data.state);
      }
    } catch {
      // Revert on error — re-fetch
      const res = await fetch('/api/user/onboarding');
      const data = await res.json();
      if (data.ok && data.state) {
        setState(data.state);
      }
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ state, loading, updateState }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
