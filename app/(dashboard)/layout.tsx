"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar"
import Topbar from "@/components/Topbar"
import DemoModeBanner from "@/components/DemoModeBanner"
import OnboardingPhoneSelector from "@/components/OnboardingPhoneSelector"
import ThemeSelectionModal from "@/components/ThemeSelectionModal"
import OnboardingTour from "@/components/OnboardingTour"
import OnboardingCongratsModal from "@/components/OnboardingCongratsModal"
import { ThemeProvider } from "@/lib/ThemeContext"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ThemeProvider>
      <div className="min-h-screen flex bg-white dark:bg-slate-900 relative text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {/* Demo Mode Banner */}
        <DemoModeBanner />

        {/* Background Pattern - subtle dots */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #0ea5e9 0.5px, transparent 0)',
            backgroundSize: '24px 24px'
          }} />
        </div>
        {/* Mobile menu button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-lg bg-white dark:bg-[#1a1f2e] border border-slate-200 dark:border-slate-700 dark:border-white/10 text-slate-700 dark:text-slate-300 dark:text-gray-300 shadow-sm"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed md:static inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col w-full md:w-auto relative z-10">
          <Topbar />
          <div className="container py-6 px-4 md:px-6">{children}</div>
        </main>

        {/* Onboarding Flow Components (in order) */}
        {/* 1. Phone Number Selection - first step */}
        <OnboardingPhoneSelector />

        {/* 2. Theme Selection Modal - second step */}
        <ThemeSelectionModal />

        {/* 3. Interactive Onboarding Tour - third step */}
        <OnboardingTour />

        {/* 4. Congratulations Modal - final step */}
        <OnboardingCongratsModal />
      </div>
    </ThemeProvider>
  )
}
