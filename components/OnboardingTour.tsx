'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useOnboarding } from '@/lib/OnboardingContext';

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
    description: 'Your command center. See upcoming appointments, unread messages, and your lead pipeline at a glance.',
    position: 'right',
  },
  {
    target: '[href="/leads"]',
    title: 'Leads',
    description: 'Your prospects. Add leads manually or import from CSV, then assign campaigns, tag their stage, and track them through your pipeline.',
    position: 'right',
  },
  {
    target: '[href="/texts"]',
    title: 'Messages',
    description: 'Your conversation inbox. View and respond to lead and client conversations, send individual SMS, and let AI handle replies.',
    position: 'right',
  },
  {
    target: '[href="/campaigns"]',
    title: 'Campaigns',
    description: 'Categorize your leads by type — health, life, auto, solar, roofing, and more. Each campaign segments leads so you can target the right audience.',
    position: 'right',
  },
  {
    target: '[href="/templates"]',
    title: 'Flows',
    description: 'AI conversation templates that qualify your leads and book appointments automatically. Use industry presets or build your own.',
    position: 'right',
  },
  {
    target: '[href="/settings"]',
    title: 'Settings',
    description: 'Manage your plan, configure spam protection, maintain your DNC list, and set up auto-buy for credits.',
    position: 'right',
  },
];

export default function OnboardingTour() {
  const { state, loading, updateState } = useOnboarding();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (loading) return;
    // Tour starts after both phone selection AND theme selection are done
    if (state.phone_selected && state.theme_selected && !state.tour_completed) {
      const timer = setTimeout(() => {
        setIsActive(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, state.phone_selected, state.theme_selected, state.tour_completed]);

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

  const completeTour = async () => {
    await updateState({ tour_completed: true });
    setIsActive(false);
  };

  const skipTour = async () => {
    await updateState({ tour_completed: true });
    setIsActive(false);
  };

  if (!isActive || !targetRect) return null;

  const step = tourSteps[currentStep];

  // Calculate tooltip position with mobile support
  const getTooltipPosition = () => {
    const padding = 20;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const tooltipWidth = isMobile ? Math.min(window.innerWidth - 32, 380) : 420;
    const tooltipHeight = 260;

    // On mobile, always position at bottom center of screen
    if (isMobile) {
      return {
        top: 'auto',
        bottom: 20,
        left: 16,
        right: 16,
        width: 'calc(100vw - 32px)',
        maxWidth: '420px',
        position: 'fixed' as const,
      };
    }

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
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

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
            className="fixed z-[202] w-[calc(100vw-32px)] sm:w-[420px] max-w-[420px]"
            style={isMobile ? {
              bottom: 20,
              left: 16,
              right: 16,
              top: 'auto',
            } : {
              top: tooltipPos.top,
              left: tooltipPos.left,
            }}
          >
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-sky-500 to-teal-500 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-white" />
                  <span className="text-white font-bold text-lg">{step.title}</span>
                </div>
                <button
                  onClick={skipTour}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-slate-600 dark:text-slate-300 text-base leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-between">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Step {currentStep + 1} of {tourSteps.length}
                </div>
                <div className="flex items-center gap-3">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="px-5 py-2 text-sm font-medium bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors flex items-center gap-1"
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
              <div className="px-6 pb-4 flex justify-center gap-2">
                {tourSteps.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
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

            {/* Arrow pointer - hidden on mobile */}
            {!isMobile && (
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
            )}
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
