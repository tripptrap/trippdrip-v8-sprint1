'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import CustomModal from "@/components/CustomModal";

export default function CalendarPage() {
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  useEffect(() => {
    checkCalendarConnection();

    // Check for calendar connection status from OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('calendar_connected') === 'true') {
      setCalendarConnected(true);
      toast.success('Google Calendar connected successfully!');
      window.history.replaceState({}, '', '/email');
    } else if (urlParams.get('calendar_error')) {
      toast.error(`Calendar connection error: ${urlParams.get('calendar_error')}`);
      window.history.replaceState({}, '', '/email');
    }
  }, []);

  const checkCalendarConnection = async () => {
    try {
      const response = await fetch('/api/calendar/status');
      const data = await response.json();
      setCalendarConnected(data.connected || false);
    } catch (error) {
      console.error('Error checking calendar connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectCalendar = async () => {
    setConnectingCalendar(true);
    try {
      const response = await fetch('/api/calendar/oauth');
      const data = await response.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error('Failed to initiate calendar connection');
        setConnectingCalendar(false);
      }
    } catch (error: any) {
      console.error('Error connecting calendar:', error);
      toast.error(`Error: ${error.message}`);
      setConnectingCalendar(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    setModalState({
      isOpen: true,
      title: 'Disconnect Calendar',
      message: 'Are you sure you want to disconnect Google Calendar?',
      type: 'confirm',
      onConfirm: async () => {
        setDisconnectingCalendar(true);
        try {
          const response = await fetch('/api/calendar/disconnect', {
            method: 'POST'
          });

          if (response.ok) {
            setCalendarConnected(false);
            toast.success('Google Calendar disconnected successfully');
          } else {
            toast.error('Failed to disconnect calendar');
          }
        } catch (error: any) {
          console.error('Error disconnecting calendar:', error);
          toast.error(`Error: ${error.message}`);
        } finally {
          setDisconnectingCalendar(false);
        }
      }
    });
  };

  const closeModal = () => {
    setModalState({
      isOpen: false,
      title: '',
      message: '',
      type: 'alert',
    });
  };

  const handleModalConfirm = () => {
    if (modalState.onConfirm) {
      modalState.onConfirm();
    }
    closeModal();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Google Calendar</h1>
        <div className="card p-8 text-center text-white/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Google Calendar</h1>
        <p className="text-white/70 mt-1">Connect your Google Calendar to enable AI-powered appointment scheduling</p>
      </div>

      {calendarConnected ? (
        <div className="space-y-4">
          <div className="card bg-green-500/10 border-green-500/30">
            <h3 className="text-lg font-semibold text-green-400 mb-2">Calendar Connected</h3>
            <p className="text-white/80">
              Your Google Calendar is connected and ready to use.
            </p>
          </div>

          <div className="card">
            <h3 className="text-lg font-medium mb-3">What You Can Do</h3>
            <ul className="text-white/70 space-y-2">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>AI can check your availability before scheduling meetings</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Automatically create calendar events when booking appointments</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Send calendar invites to leads via email</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Sync all lead interactions to your calendar</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Get email and popup reminders for upcoming appointments</span>
              </li>
            </ul>
          </div>

          <div className="card">
            <h3 className="text-lg font-medium mb-3">Manage Connection</h3>
            <button
              onClick={handleDisconnectCalendar}
              disabled={disconnectingCalendar}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {disconnectingCalendar ? 'Disconnecting...' : 'Disconnect Calendar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card bg-blue-500/10 border-blue-500/30">
            <h3 className="text-xl font-semibold mb-3 text-blue-400">Connect Google Calendar</h3>
            <p className="text-white/80 mb-4">
              Connect your Google Calendar to enable smart scheduling features powered by AI.
            </p>
            <button
              onClick={handleConnectCalendar}
              disabled={connectingCalendar}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-lg hover:opacity-90 font-medium disabled:opacity-50 transition-all shadow-lg"
            >
              {connectingCalendar ? 'Connecting...' : 'Connect Google Calendar'}
            </button>
          </div>

          <div className="card">
            <h3 className="text-lg font-medium mb-3">Features You'll Get</h3>
            <ul className="text-white/70 space-y-2">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>AI checks your calendar before suggesting meeting times</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Automatically create appointments when AI books meetings</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Send calendar invitations to leads</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Track all interactions in one place</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Email and popup reminders</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Completely free - no additional costs</span>
              </li>
            </ul>
          </div>

          <div className="card bg-yellow-500/10 border-yellow-500/30">
            <h3 className="text-lg font-medium text-yellow-400 mb-3">Privacy & Security</h3>
            <ul className="text-white/70 space-y-2">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>We only access your calendar data - nothing else</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>OAuth 2.0 secure authentication</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <span>You can disconnect anytime</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Your credentials are encrypted and secure</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      <CustomModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        onConfirm={modalState.type === 'confirm' ? handleModalConfirm : undefined}
      />
    </div>
  );
}
