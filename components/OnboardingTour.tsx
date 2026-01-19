'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

const TOUR_COMPLETED_KEY = 'onboarding_tour_completed';
const THEME_SELECTED_KEY = 'theme_selection_shown';

interface TourStep {
  target: string; // CSS selector for the element to highlight
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const tourSteps: TourStep[] = [
  {
    target: '[href="/dashboard"]',
    title: 'Dashboard',
    description: 'Your command center! View key metrics, recent activity, and quick actions all in one place.',
    position: 'right',
  },
  {
    target: '[href="/leads"]',
    title: 'Leads',
    description: 'Manage all your contacts here. Add leads manually, import from CSV, or capture them automatically.',
    position: 'right',
  },
  {
    target: '[href="/messages"]',
    title: 'Messages',
    description: 'Your SMS inbox. Send individual messages, view conversations, and track responses.',
    position: 'right',
  },
  {
    target: '[href="/campaigns"]',
    title: 'Campaigns',
    description: 'Send bulk messages to multiple leads at once. Perfect for announcements and follow-ups.',
    position: 'right',
  },
  {
    target: '[href="/templates"]',
    title: 'Flows',
    description: 'Create automated conversation flows. Set up responses that guide leads through your sales process.',
    position: 'right',
  },
  {
    target: '[href="/settings"]',
    title: 'Settings',
    description: 'Customize your account, manage integrations, and adjust your preferences.',
    position: 'right',
  },
];

export default function OnboardingTour() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Check if tour has been completed and theme has been selected
    const tourCompleted = localStorage.getItem(TOUR_COMPLETED_KEY);
    const themeSelected = localStorage.getItem(THEME_SELECTED_KEY);

    if (!tourCompleted && themeSelected) {
      // Start tour after a short delay (after theme modal closes)
      const timer = setTimeout(() => {
        setIsActive(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateTargetPosition = useCallback(() => {
    if (!isActive) return;

    const step = tourSteps[currentStep];
    const element = document.querySelector(step.target);

    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    }
  }, [currentStep, isActive]);

  useEffect(() => {
    updateTargetPosition();

    // Update position on scroll/resize
    window.addEventListener('scroll', updateTargetPosition, true);
    window.addEventListener('resize', updateTargetPosition);

    return () => {
      window.removeEventListener('scroll', updateTargetPosition, true);
      window.removeEventListener('resize', updateTargetPosition);
    };
  }, [updateTargetPosition]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTour = () => {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    setIsActive(false);
  };

  const skipTour = () => {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    setIsActive(false);
  };

  if (!isActive || !targetRect) return null;

  const step = tourSteps[currentStep];

  // Calculate tooltip position
  const getTooltipPosition = () => {
    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 200;

    switch (step.position) {
      case 'right':
        return {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.right + padding,
        };
      case 'left':
        return {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.left - tooltipWidth - padding,
        };
      case 'bottom':
        return {
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
      case 'top':
        return {
          top: targetRect.top - tooltipHeight - padding,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
      default:
        return { top: 0, left: 0 };
    }
  };

  const tooltipPos = getTooltipPosition();

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200]"
            style={{
              background: 'rgba(0, 0, 0, 0.75)',
              // Create a "hole" for the highlighted element
              clipPath: targetRect
                ? `polygon(
                    0% 0%,
                    0% 100%,
                    ${targetRect.left - 8}px 100%,
                    ${targetRect.left - 8}px ${targetRect.top - 8}px,
                    ${targetRect.right + 8}px ${targetRect.top - 8}px,
                    ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
                    ${targetRect.left - 8}px ${targetRect.bottom + 8}px,
                    ${targetRect.left - 8}px 100%,
                    100% 100%,
                    100% 0%
                  )`
                : undefined,
            }}
          />

          {/* Highlight border around target */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[201] pointer-events-none"
            style={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
              border: '2px solid #0ea5e9',
              borderRadius: '12px',
              boxShadow: '0 0 0 4px rgba(14, 165, 233, 0.3), 0 0 20px rgba(14, 165, 233, 0.4)',
            }}
          />

          {/* Tooltip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed z-[202] w-80"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
            }}
          >
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-sky-500 to-teal-500 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold">{step.title}</span>
                </div>
                <button
                  onClick={skipTour}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Step {currentStep + 1} of {tourSteps.length}
                </div>
                <div className="flex items-center gap-2">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="px-4 py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors flex items-center gap-1"
                  >
                    {currentStep === tourSteps.length - 1 ? (
                      'Finish'
                    ) : (
                      <>
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress dots */}
              <div className="px-4 pb-3 flex justify-center gap-1.5">
                {tourSteps.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentStep
                        ? 'bg-sky-500'
                        : index < currentStep
                        ? 'bg-sky-300 dark:bg-sky-600'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Arrow pointer */}
            <div
              className="absolute w-4 h-4 bg-white dark:bg-slate-800 border-l border-t border-slate-200 dark:border-slate-700"
              style={{
                transform: step.position === 'right' ? 'rotate(-45deg)' :
                           step.position === 'left' ? 'rotate(135deg)' :
                           step.position === 'bottom' ? 'rotate(45deg)' : 'rotate(-135deg)',
                ...(step.position === 'right' && { left: -8, top: '50%', marginTop: -8 }),
                ...(step.position === 'left' && { right: -8, top: '50%', marginTop: -8 }),
                ...(step.position === 'bottom' && { top: -8, left: '50%', marginLeft: -8 }),
                ...(step.position === 'top' && { bottom: -8, left: '50%', marginLeft: -8 }),
              }}
            />
          </motion.div>

          {/* Skip button in corner */}
          <button
            onClick={skipTour}
            className="fixed bottom-6 right-6 z-[203] px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg backdrop-blur-sm transition-colors"
          >
            Skip Tour
          </button>
        </>
      )}
    </AnimatePresence>
  );
}
