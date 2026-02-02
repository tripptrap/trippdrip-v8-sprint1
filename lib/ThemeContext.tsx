'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // 1. Check localStorage first for instant load (no flash)
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setThemeState(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    }

    // 2. Then fetch from DB and sync
    const fetchThemeFromDB = async () => {
      try {
        const res = await fetch('/api/user/settings');
        const data = await res.json();
        if (data.ok && data.settings?.preferences?.theme) {
          const dbTheme = data.settings.preferences.theme as Theme;
          setThemeState(dbTheme);
          localStorage.setItem('theme', dbTheme);
          document.documentElement.classList.toggle('dark', dbTheme === 'dark');
        }
      } catch {
        // Keep localStorage/default value
      }
    };
    fetchThemeFromDB();
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');

    // Save to DB
    fetch('/api/user/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: { theme: newTheme } }),
    }).catch(() => {});

    // Dispatch event for other components to listen
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Prevent flash of wrong theme
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
