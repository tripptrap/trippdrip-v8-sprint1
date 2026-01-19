'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Sun, Moon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const THEME_SELECTED_KEY = 'theme_selection_shown';

export default function ThemeSelectionModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark'>(theme);

  useEffect(() => {
    // Check if user has already seen the theme selection
    const hasSeenModal = localStorage.getItem(THEME_SELECTED_KEY);
    if (!hasSeenModal) {
      // Small delay to let the page load first
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConfirm = () => {
    setTheme(selectedTheme);
    localStorage.setItem(THEME_SELECTED_KEY, 'true');
    setIsOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem(THEME_SELECTED_KEY, 'true');
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-sky-500 to-teal-500 p-6 text-white">
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  {selectedTheme === 'light' ? (
                    <Sun className="w-6 h-6" />
                  ) : (
                    <Moon className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold">Welcome to HyveWyre!</h2>
                  <p className="text-white/80 text-sm">Let's personalize your experience</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-300 mb-6 text-center">
                Choose your preferred display mode
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Light Mode Option */}
                <button
                  onClick={() => setSelectedTheme('light')}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    selectedTheme === 'light'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  {selectedTheme === 'light' && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <div className="w-12 h-12 mx-auto mb-3 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Sun className="w-6 h-6 text-amber-500" />
                  </div>
                  <p className="font-medium text-slate-900 dark:text-white">Light Mode</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Bright and clean</p>
                </button>

                {/* Dark Mode Option */}
                <button
                  onClick={() => setSelectedTheme('dark')}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    selectedTheme === 'dark'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  {selectedTheme === 'dark' && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <div className="w-12 h-12 mx-auto mb-3 bg-slate-800 rounded-xl flex items-center justify-center">
                    <Moon className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="font-medium text-slate-900 dark:text-white">Dark Mode</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Easy on the eyes</p>
                </button>
              </div>

              <button
                onClick={handleConfirm}
                className="w-full py-3 bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/25"
              >
                Continue
              </button>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
                You can change this anytime in Settings
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
