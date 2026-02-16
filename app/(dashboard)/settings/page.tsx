'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import {
  loadSettings,
  updateSpamProtection,
  updateAutoRefill,
  updateEmailConfig,
  type Settings,
  type EmailConfig
} from '@/lib/settingsStore';
import { addPoints } from '@/lib/pointsSupabase';
import toast from 'react-hot-toast';
import PrivacyPolicyPage from '../../(public)/privacy/page';
import TermsOfServicePage from '../../(public)/terms/page';
import CompliancePage from '../../(public)/compliance/page';
import RefundPolicyPage from '../../(public)/refund/page';
import ContactPage from '../contact/page';
import IntegrationsPage from '../integrations/page';
import DNCPage from '../dnc/page';
import CustomModal from '@/components/CustomModal';
import NotificationSettings from '@/components/NotificationSettings';

export default function Page() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeTab, setActiveTab] = useState<'spam' | 'autorefill' | 'notifications' | 'numbers' | 'integrations' | 'dnc' | 'privacy' | 'terms' | 'compliance' | 'refund' | 'contact' | 'account' | 'plan' | 'aihandoff'>('plan');
  const [saveMessage, setSaveMessage] = useState('');

  // Spam protection form
  const [spamEnabled, setSpamEnabled] = useState(true);
  const [blockOnHighRisk, setBlockOnHighRisk] = useState(true);
  const [maxHourly, setMaxHourly] = useState(100);
  const [maxDaily, setMaxDaily] = useState(1000);
  // Advanced rate limiting
  const [maxPerMinute, setMaxPerMinute] = useState(10);
  const [maxPerContact, setMaxPerContact] = useState(5);
  const [cooldownMinutes, setCooldownMinutes] = useState(30);
  const [maxCampaignHourly, setMaxCampaignHourly] = useState(200);
  const [maxBulkRecipients, setMaxBulkRecipients] = useState(500);
  const [enableWeekendLimits, setEnableWeekendLimits] = useState(false);
  const [weekendLimitPercent, setWeekendLimitPercent] = useState(50);

  // Auto refill form
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(false);
  const [autoRefillThreshold, setAutoRefillThreshold] = useState(100);
  const [autoRefillAmount, setAutoRefillAmount] = useState(500);

  // Email configuration form
  const [emailProvider, setEmailProvider] = useState<'smtp' | 'sendgrid' | 'none'>('none');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [sendgridApiKey, setSendgridApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');

  // Free number pool
  const [poolNumbers, setPoolNumbers] = useState<Array<{ id: string; phone_number: string; friendly_name: string | null; number_type: string; region: string | null }>>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [claimingNumber, setClaimingNumber] = useState(false);
  const [myTelnyxNumbers, setMyTelnyxNumbers] = useState<Array<{ phone_number: string; friendly_name: string | null; status: string; is_primary: boolean }>>([]);
  const [telnyxLoading, setTelnyxLoading] = useState(true);

  // Quiet hours settings
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState('08:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('20:00');
  const [userTimezone, setUserTimezone] = useState('America/New_York');

  // Plan info
  const [userPlan, setUserPlan] = useState<string>('growth');
  const [userCredits, setUserCredits] = useState(0);
  const [nextRenewal, setNextRenewal] = useState<string | null>(null);

  // AI Handoff settings
  const [aiHandoffEnabled, setAiHandoffEnabled] = useState(true);
  const [handoffOnHotLead, setHandoffOnHotLead] = useState(true);
  const [handoffOnPriceQuestion, setHandoffOnPriceQuestion] = useState(true);
  const [handoffOnAppointmentRequest, setHandoffOnAppointmentRequest] = useState(true);
  const [handoffOnNegativeSentiment, setHandoffOnNegativeSentiment] = useState(true);
  const [handoffAfterReplies, setHandoffAfterReplies] = useState(3);
  const [handoffKeywords, setHandoffKeywords] = useState('speak to someone, talk to a person, real person, human, manager, supervisor');
  const [notifyOnHandoff, setNotifyOnHandoff] = useState(true);

  // Profile editing
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Account deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  // Helper functions for modals
  const showAlert = (message: string, title: string = 'Alert') => {
    setModalState({
      isOpen: true,
      title,
      message,
      type: 'info',
      onConfirm: () => setModalState(prev => ({ ...prev, isOpen: false }))
    });
  };

  const showConfirm = (message: string, onConfirm: () => void, title: string = 'Confirm') => {
    setModalState({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm: () => {
        setModalState(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      onCancel: () => setModalState(prev => ({ ...prev, isOpen: false }))
    });
  };

  useEffect(() => {
    async function loadData() {
      const data = await loadSettings();
      setSettings(data);

      setSpamEnabled(data.spamProtection.enabled);
      setBlockOnHighRisk(data.spamProtection.blockOnHighRisk);
      setMaxHourly(data.spamProtection.maxHourlyMessages);
      setMaxDaily(data.spamProtection.maxDailyMessages);
      // Advanced rate limiting
      setMaxPerMinute(data.spamProtection.maxMessagesPerMinute || 10);
      setMaxPerContact(data.spamProtection.maxMessagesPerContact || 5);
      setCooldownMinutes(data.spamProtection.cooldownMinutes || 30);
      setMaxCampaignHourly(data.spamProtection.maxCampaignMessagesPerHour || 200);
      setMaxBulkRecipients(data.spamProtection.maxBulkRecipients || 500);
      setEnableWeekendLimits(data.spamProtection.enableWeekendLimits || false);
      setWeekendLimitPercent(data.spamProtection.weekendLimitPercent || 50);

      setAutoRefillEnabled(data.autoRefill.enabled);
      setAutoRefillThreshold(data.autoRefill.threshold);
      setAutoRefillAmount(data.autoRefill.amount);

      // Load email settings
      if (data.email) {
        setEmailProvider(data.email.provider);
      setSmtpHost(data.email.smtpHost || '');
      setSmtpPort(data.email.smtpPort || 587);
      setSmtpUser(data.email.smtpUser || '');
      setSmtpPass(data.email.smtpPass || '');
      setSmtpSecure(data.email.smtpSecure || false);
      setSendgridApiKey(data.email.sendgridApiKey || '');
      setFromEmail(data.email.fromEmail || '');
      setFromName(data.email.fromName || '');
      setReplyTo(data.email.replyTo || '');
      }

      // Load user profile
      try {
        const profileRes = await fetch('/api/user/profile');
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfileName(profileData.full_name || '');
          setProfileEmail(profileData.email || '');
          setProfilePhone(profileData.phone || '');
        }
      } catch (e) { /* silent */ }

      // Load quiet hours settings
      const quietHoursRes = await fetch('/api/settings/quiet-hours');
      if (quietHoursRes.ok) {
        const quietHoursData = await quietHoursRes.json();
        if (quietHoursData.ok) {
          setQuietHoursEnabled(quietHoursData.quietHours.enabled);
          setQuietHoursStart(quietHoursData.quietHours.start.substring(0, 5)); // Convert HH:MM:SS to HH:MM
          setQuietHoursEnd(quietHoursData.quietHours.end.substring(0, 5));
          setUserTimezone(quietHoursData.quietHours.timezone);
        }
      }

      // Listen for updates
      const handler = (e: any) => {
        setSettings(e.detail);
      };
      window.addEventListener('settingsUpdated', handler);
      return () => window.removeEventListener('settingsUpdated', handler);
    }

    loadData();
  }, []);

  // Fetch Telnyx numbers + pool numbers when numbers tab is active
  useEffect(() => {
    if (activeTab === 'numbers') {
      fetchTelnyxNumbers();
      fetchPoolNumbers();
    }
  }, [activeTab]);

  async function fetchTelnyxNumbers() {
    setTelnyxLoading(true);
    try {
      const res = await fetch('/api/telnyx/numbers');
      const data = await res.json();
      if (data.success || data.numbers) {
        setMyTelnyxNumbers(data.numbers || []);
      }
      // Handle auto-released unverified numbers
      if (data.numbersReleased && data.numbersReleased.length > 0) {
        toast.error(data.releaseMessage || 'An unverified number was released. Please claim a verified one.');
        await fetchPoolNumbers();
      }
    } catch (e) {
      console.error('Failed to fetch telnyx numbers:', e);
    } finally {
      setTelnyxLoading(false);
    }
  }

  async function fetchPoolNumbers() {
    setPoolLoading(true);
    try {
      const res = await fetch('/api/number-pool/available');
      const data = await res.json();
      if (data.success && data.numbers?.length > 0) {
        setPoolNumbers(data.numbers);
      } else {
        setPoolNumbers([]);
      }
    } catch (e) {
      console.error('Failed to fetch pool numbers:', e);
    } finally {
      setPoolLoading(false);
    }
  }

  async function handleClaimPoolNumber(numberId: string) {
    setClaimingNumber(true);
    try {
      const res = await fetch('/api/number-pool/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Number claimed! You can start sending messages now.');
        await fetchTelnyxNumbers();
        await fetchPoolNumbers();
      } else {
        toast.error(data.error || 'Failed to claim number');
      }
    } catch (e) {
      toast.error('Failed to claim number');
    } finally {
      setClaimingNumber(false);
    }
  }

  const formatPhoneNumber = (phone: string) => {
    const d = phone.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return phone;
  };

  const saveSpamSettings = () => {
    updateSpamProtection({
      enabled: spamEnabled,
      blockOnHighRisk,
      maxHourlyMessages: maxHourly,
      maxDailyMessages: maxDaily,
      maxMessagesPerMinute: maxPerMinute,
      maxMessagesPerContact: maxPerContact,
      cooldownMinutes: cooldownMinutes,
      maxCampaignMessagesPerHour: maxCampaignHourly,
      maxBulkRecipients: maxBulkRecipients,
      enableWeekendLimits: enableWeekendLimits,
      weekendLimitPercent: weekendLimitPercent
    });
    showSaveMessage('Spam protection settings saved!');
  };

  const saveAutoRefillSettings = () => {
    updateAutoRefill({
      enabled: autoRefillEnabled,
      threshold: autoRefillThreshold,
      amount: autoRefillAmount
    });
    showSaveMessage('Auto-refill settings saved!');
  };

  const saveEmailSettings = async () => {
    const config: EmailConfig = {
      provider: emailProvider,
      fromEmail,
      fromName,
      replyTo,
    };

    if (emailProvider === 'smtp') {
      config.smtpHost = smtpHost;
      config.smtpPort = smtpPort;
      config.smtpUser = smtpUser;
      config.smtpPass = smtpPass;
      config.smtpSecure = smtpSecure;
    } else if (emailProvider === 'sendgrid') {
      config.sendgridApiKey = sendgridApiKey;
    }

    await updateEmailConfig(config);
    const updated = await loadSettings();
    setSettings(updated);
    showSaveMessage('Email settings saved!');
  };

  const showSaveMessage = (msg: string) => {
    setSaveMessage(msg);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleSaveQuietHours = async () => {
    try {
      const response = await fetch('/api/settings/quiet-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: quietHoursEnabled,
          start: quietHoursStart,
          end: quietHoursEnd,
          timezone: userTimezone
        })
      });

      const result = await response.json();

      if (response.ok && result.ok) {
        showSaveMessage('Quiet hours updated successfully');
        toast.success('Quiet hours settings saved');
      } else {
        toast.error(result.error || 'Failed to save quiet hours');
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profileName.trim(),
          phone: profilePhone.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Profile updated');
      } else {
        toast.error(data.error || 'Failed to update profile');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Password updated');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || 'Failed to change password');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE MY ACCOUNT') {
      toast.error('Please type "DELETE MY ACCOUNT" to confirm');
      return;
    }

    setDeletingAccount(true);
    try {
      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success('Account deleted successfully. Redirecting...');
        setTimeout(() => {
          window.location.href = '/preview';
        }, 2000);
      } else {
        toast.error(result.error || 'Failed to delete account');
        setDeletingAccount(false);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
      setDeletingAccount(false);
    }
  };

  if (!settings) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {saveMessage && (
          <div className="bg-sky-500/10 text-sky-600 px-4 py-2 rounded-lg border border-sky-200">
            {saveMessage}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700 pb-2">
        {/* Core Settings */}
        <button
          onClick={() => setActiveTab('plan')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'plan'
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-b-2 border-purple-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Plan
        </button>
        <button
          onClick={() => setActiveTab('numbers')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'numbers'
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-b-2 border-sky-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Phone Numbers
        </button>
        <button
          onClick={() => setActiveTab('spam')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'spam'
              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-b-2 border-orange-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Spam Protection
        </button>
        <button
          onClick={() => setActiveTab('aihandoff')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'aihandoff'
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          AI Handoff
        </button>
        <button
          onClick={() => setActiveTab('autorefill')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'autorefill'
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-b-2 border-sky-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Auto-Refill
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'notifications'
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-b-2 border-sky-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Notifications
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'integrations'
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-b-2 border-sky-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Integrations
        </button>
        <button
          onClick={() => setActiveTab('dnc')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'dnc'
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-b-2 border-sky-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          DNC List
        </button>
        <span className="text-slate-300 dark:text-slate-600 self-center px-1">|</span>
        <button
          onClick={() => setActiveTab('privacy')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'privacy'
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-b-2 border-slate-400'
              : 'text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Privacy
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'terms'
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-b-2 border-slate-400'
              : 'text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Terms
        </button>
        <button
          onClick={() => setActiveTab('compliance')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'compliance'
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-b-2 border-slate-400'
              : 'text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Compliance
        </button>
        <button
          onClick={() => setActiveTab('refund')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'refund'
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-b-2 border-slate-400'
              : 'text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Refund
        </button>
        <button
          onClick={() => setActiveTab('contact')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'contact'
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-b-2 border-slate-400'
              : 'text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Contact
        </button>
        <span className="text-slate-300 dark:text-slate-600 self-center px-1">|</span>
        <button
          onClick={() => setActiveTab('account')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t ${
            activeTab === 'account'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-b-2 border-red-500'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Account
        </button>
      </div>

      {/* Plan Management Tab */}
      {activeTab === 'plan' && (
        <div className="space-y-6">
          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Your Subscription</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="text-sm text-purple-600 dark:text-purple-400 mb-1">Current Plan</p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300 capitalize">{userPlan || 'Growth'}</p>
              </div>
              <div className="p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
                <p className="text-sm text-sky-600 dark:text-sky-400 mb-1">Credit Balance</p>
                <p className="text-2xl font-bold text-sky-700 dark:text-sky-300">{userCredits.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">Next Renewal</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{nextRenewal || '—'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-slate-900 dark:text-slate-100">Plan Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500">✓</span> Unlimited contacts
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500">✓</span> Unlimited campaigns
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500">✓</span> AI-powered responses
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500">✓</span> AI Receptionist mode
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500">✓</span> Advanced analytics
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500">✓</span> Priority support
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <a
                href="/points"
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
              >
                Manage Plan & Credits
              </a>
              <a
                href="/points"
                className="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Buy More Credits
              </a>
            </div>
          </div>

          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Volume Discounts</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Save more when you buy credit packs in bulk. Scale plan members get the best rates!
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Starter 4K</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">10% off</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Pro 10K</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">20% off</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Business 25K</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">25% off</p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-600 dark:text-amber-400">Enterprise 60K</p>
                <p className="font-bold text-amber-700 dark:text-amber-300">30% off</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Handoff Tab */}
      {activeTab === 'aihandoff' && (
        <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">AI Handoff Settings</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Configure when the AI should automatically hand off conversations to you for personal follow-up.
          </p>

          {/* Master Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 mb-6">
            <div>
              <h3 className="font-medium text-slate-900 dark:text-slate-100">Enable AI Handoff</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Get notified when AI detects high-value opportunities
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={aiHandoffEnabled}
                onChange={(e) => setAiHandoffEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {aiHandoffEnabled && (
            <div className="space-y-6">
              {/* Trigger Conditions */}
              <div>
                <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Handoff Triggers</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">Hot Lead Detected</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">When AI identifies a lead with high purchase intent</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={handoffOnHotLead}
                      onChange={(e) => setHandoffOnHotLead(e.target.checked)}
                      className="w-5 h-5 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">Price/Quote Request</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">When lead asks about pricing, quotes, or costs</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={handoffOnPriceQuestion}
                      onChange={(e) => setHandoffOnPriceQuestion(e.target.checked)}
                      className="w-5 h-5 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">Appointment Request</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">When lead wants to schedule a call or meeting</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={handoffOnAppointmentRequest}
                      onChange={(e) => setHandoffOnAppointmentRequest(e.target.checked)}
                      className="w-5 h-5 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">Negative Sentiment</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">When lead expresses frustration or dissatisfaction</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={handoffOnNegativeSentiment}
                      onChange={(e) => setHandoffOnNegativeSentiment(e.target.checked)}
                      className="w-5 h-5 text-emerald-600 bg-slate-100 border-slate-300 rounded focus:ring-emerald-500"
                    />
                  </label>
                </div>
              </div>

              {/* Conversation Depth */}
              <div>
                <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Auto-Handoff After Replies</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Automatically hand off after this many lead replies (0 = disabled)
                </p>
                <input
                  type="number"
                  value={handoffAfterReplies}
                  onChange={(e) => setHandoffAfterReplies(Number(e.target.value))}
                  min="0"
                  max="20"
                  className="w-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Keywords */}
              <div>
                <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Handoff Keywords</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Trigger handoff when lead uses these phrases (comma-separated)
                </p>
                <textarea
                  value={handoffKeywords}
                  onChange={(e) => setHandoffKeywords(e.target.value)}
                  rows={3}
                  placeholder="speak to someone, talk to a person, real person, human, manager"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                />
              </div>

              {/* Notification */}
              <label className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700 cursor-pointer">
                <div>
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">Send Browser Notification</span>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Get notified immediately when a handoff occurs</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyOnHandoff}
                  onChange={(e) => setNotifyOnHandoff(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 bg-slate-100 border-emerald-300 rounded focus:ring-emerald-500"
                />
              </label>

              <button
                onClick={() => {
                  toast.success('AI handoff settings saved');
                }}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
              >
                Save AI Handoff Settings
              </button>
            </div>
          )}
        </div>
      )}

      {/* Phone Numbers Tab */}
      {activeTab === 'numbers' && (
        <div className="space-y-6">
          {/* Your Numbers */}
          <div className="card space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Your Phone Numbers</h2>
            {telnyxLoading ? (
              <div className="p-6 text-center text-slate-500 dark:text-slate-400">Loading numbers...</div>
            ) : myTelnyxNumbers.length > 0 ? (
              <div className="space-y-2">
                {myTelnyxNumbers.map((num) => (
                  <div
                    key={num.phone_number}
                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div>
                      <div className="font-mono font-semibold text-lg text-slate-900 dark:text-slate-100">
                        {formatPhoneNumber(num.phone_number)}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {num.friendly_name || 'Toll-Free'} • {num.status || 'Active'}
                        {num.is_primary && <span className="ml-2 text-sky-600 font-medium">★ Primary</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700/50 text-center">
                <p className="text-slate-700 dark:text-slate-300 font-medium mb-1">No phone number selected</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">You need a phone number to send and receive messages. Claim a free one below!</p>
              </div>
            )}
          </div>

          {/* Free Number Pool */}
          {myTelnyxNumbers.length === 0 && (
            <div className="card space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full">FREE</span>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Claim a Phone Number</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Select a toll-free number included with your plan. No extra cost.
                </p>
              </div>

              {poolLoading ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  <div className="animate-spin h-6 w-6 border-2 border-sky-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  Searching for available numbers...
                </div>
              ) : poolNumbers.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {poolNumbers.map((num) => (
                    <div
                      key={num.id}
                      className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-600 transition-colors"
                    >
                      <div>
                        <div className="font-mono font-semibold text-lg text-slate-900 dark:text-slate-100">
                          {formatPhoneNumber(num.phone_number)}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {num.number_type === 'tollfree' ? 'Toll-Free' : 'Local'}
                          {num.region && ` • ${num.region}`}
                          <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">Free with plan</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleClaimPoolNumber(num.id)}
                        disabled={claimingNumber}
                        className="bg-sky-500 hover:bg-sky-600 text-white px-5 py-2 rounded-lg disabled:opacity-50 text-sm font-medium transition-colors"
                      >
                        {claimingNumber ? 'Claiming...' : 'Claim'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  <p className="mb-2">No pool numbers available right now.</p>
                  <p className="text-sm">Visit the <a href="/phone-numbers" className="text-sky-600 dark:text-sky-400 hover:underline">Phone Numbers</a> page to search and purchase a number.</p>
                </div>
              )}
            </div>
          )}

          {/* Link to full phone numbers page */}
          <div className="text-center">
            <a
              href="/phone-numbers"
              className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
            >
              Need more options? Go to the full Phone Numbers page →
            </a>
          </div>
        </div>
      )}

      {/* Spam Protection Tab */}
      {activeTab === 'spam' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Spam Protection & Rate Limiting</h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Configure spam detection and rate limiting to protect your sender reputation and ensure compliance.
            </p>
          </div>

          {/* Spam Detection Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
              Spam Detection
            </h3>

            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-medium">Enable Spam Protection</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Automatically detect and flag messages with spam indicators
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={spamEnabled}
                  onChange={(e) => setSpamEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-medium">Block High Risk Messages</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Prevent sending of messages with critical spam scores (60+)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockOnHighRisk}
                  onChange={(e) => setBlockOnHighRisk(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              </label>
            </div>
          </div>

          {/* Global Rate Limits Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
              Global Rate Limits
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Set overall limits for all outbound messages across your account.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium mb-2">
                  Max Messages Per Minute
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={maxPerMinute}
                    onChange={(e) => setMaxPerMinute(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                  <span className="text-sm text-slate-500">msgs/min</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Burst protection (1-60)</p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium mb-2">
                  Max Messages Per Hour
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={maxHourly}
                    onChange={(e) => setMaxHourly(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                  <span className="text-sm text-slate-500">msgs/hour</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Hourly limit (10-1000)</p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium mb-2">
                  Max Messages Per Day
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="100"
                    max="10000"
                    value={maxDaily}
                    onChange={(e) => setMaxDaily(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                  <span className="text-sm text-slate-500">msgs/day</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Daily limit (100-10000)</p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium mb-2">
                  Campaign Messages Per Hour
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={maxCampaignHourly}
                    onChange={(e) => setMaxCampaignHourly(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                  <span className="text-sm text-slate-500">msgs/hour</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Per campaign limit (10-500)</p>
              </div>
            </div>
          </div>

          {/* Contact-Level Limits Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
              Contact-Level Limits
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Prevent over-messaging individual contacts to maintain engagement.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium mb-2">
                  Max Messages Per Contact (Daily)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={maxPerContact}
                    onChange={(e) => setMaxPerContact(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                  <span className="text-sm text-slate-500">msgs/day</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Messages to same contact per day (1-20)</p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium mb-2">
                  Cooldown Between Messages
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                  <span className="text-sm text-slate-500">minutes</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Min time between messages to same contact (0-1440)</p>
              </div>
            </div>
          </div>

          {/* Bulk Messaging Limits Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
              Bulk Messaging Limits
            </h3>

            <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <label className="block text-sm font-medium mb-2">
                Max Bulk Recipients
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={maxBulkRecipients}
                  onChange={(e) => setMaxBulkRecipients(Number(e.target.value))}
                  className="w-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
                <span className="text-sm text-slate-500">recipients per send</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Maximum recipients in a single bulk send operation (10-5000)</p>
            </div>
          </div>

          {/* Weekend Limits Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
              Weekend Limits
            </h3>

            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-medium">Enable Weekend Limits</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Automatically reduce message limits on Saturdays and Sundays
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableWeekendLimits}
                  onChange={(e) => setEnableWeekendLimits(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
              </label>
            </div>

            {enableWeekendLimits && (
              <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium mb-2">
                  Weekend Limit Percentage: {weekendLimitPercent}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="10"
                  value={weekendLimitPercent}
                  onChange={(e) => setWeekendLimitPercent(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>10%</span>
                  <span>Weekend: {Math.round(maxHourly * weekendLimitPercent / 100)}/hr, {Math.round(maxDaily * weekendLimitPercent / 100)}/day</span>
                  <span>100%</span>
                </div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
            <h4 className="font-medium text-sky-800 dark:text-sky-200 mb-2">About Rate Limiting</h4>
            <ul className="text-sm text-sky-700 dark:text-sky-300 space-y-1 list-disc list-inside">
              <li>Rate limits protect your sender reputation and prevent carrier blocking</li>
              <li>Contact-level limits prevent individual contacts from being over-messaged</li>
              <li>Cooldown periods ensure natural conversation pacing</li>
              <li>Weekend limits help maintain compliance and respect contact preferences</li>
            </ul>
          </div>

          <button
            onClick={saveSpamSettings}
            className="bg-sky-600 text-white px-6 py-2 rounded-lg hover:bg-sky-700 transition-colors"
          >
            Save Rate Limit Settings
          </button>
        </div>
      )}

      {/* Auto-Refill Tab */}
      {activeTab === 'autorefill' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Auto-Refill Points</h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Automatically purchase more points when your balance gets low.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="font-medium">Enable Auto-Refill</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Automatically top up points when balance is low
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefillEnabled}
                  onChange={(e) => setAutoRefillEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white dark:bg-slate-800/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--accent)]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:border-white/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent)]"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Refill When Balance Drops Below: {autoRefillThreshold} points
              </label>
              <input
                type="number"
                value={autoRefillThreshold}
                onChange={(e) => setAutoRefillThreshold(Number(e.target.value))}
                min="10"
                max="1000"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Refill Amount: {autoRefillAmount} points
              </label>
              <input
                type="number"
                value={autoRefillAmount}
                onChange={(e) => setAutoRefillAmount(Number(e.target.value))}
                min="100"
                max="10000"
                step="100"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Estimated cost: ${(autoRefillAmount * 0.01).toFixed(2)}
              </p>
            </div>

            <button
              onClick={saveAutoRefillSettings}
              className="bg-[var(--accent)] text-slate-900 dark:text-slate-100 px-6 py-2 rounded-lg hover:opacity-90"
            >
              Save Auto-Refill Settings
            </button>

            <div className="mt-4 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
              <h3 className="font-medium text-yellow-400 mb-2">Note</h3>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Auto-refill requires Stripe integration. You'll be charged automatically when
                your balance drops below the threshold.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <NotificationSettings />
        </div>
      )}

      {/* Privacy Policy Tab */}
      {activeTab === 'privacy' && <PrivacyPolicyPage />}

      {/* Terms of Service Tab */}
      {activeTab === 'terms' && <TermsOfServicePage />}

      {/* Compliance Tab */}
      {activeTab === 'compliance' && <CompliancePage />}

      {/* Refund Policy Tab */}
      {activeTab === 'refund' && <RefundPolicyPage />}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && <IntegrationsPage />}

      {/* DNC List Tab */}
      {activeTab === 'dnc' && (
        <div className="space-y-6">
          {/* Opt-Out Keyword Configuration */}
          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">SMS Opt-Out Keyword</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Choose the keyword leads can reply with to opt out of receiving messages. This keyword will be appended to the first message sent to each new lead.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Opt-Out Keyword
                </label>
                <input
                  type="text"
                  value={settings?.optOutKeyword || ''}
                  onChange={(e) => {
                    if (settings) {
                      setSettings({ ...settings, optOutKeyword: e.target.value.toUpperCase() });
                    }
                  }}
                  placeholder="e.g. STOP"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              <button
                onClick={async () => {
                  if (!settings?.optOutKeyword?.trim()) {
                    toast.error('Please enter an opt-out keyword');
                    return;
                  }
                  try {
                    await fetch('/api/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ optOutKeyword: settings.optOutKeyword.trim().toUpperCase() }),
                    });
                    toast.success('Opt-out keyword saved');
                  } catch (err) {
                    toast.error('Failed to save opt-out keyword');
                  }
                }}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              First messages will include: &quot;Reply {settings?.optOutKeyword || 'STOP'} to opt out&quot;
            </p>
          </div>

          {/* DNC List */}
          <DNCPage />
        </div>
      )}

      {/* Contact Tab */}
      {activeTab === 'contact' && <ContactPage />}

      {/* Account Management Tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Profile Info */}
          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={profileEmail}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Email cannot be changed. Contact support if you need to update it.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="Your phone number"
                />
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>

          {/* Change Password */}
          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Change Password</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="Confirm password"
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>

          {/* Appearance */}
          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">🌓 Appearance</h2>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Dark Mode</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Switch between light and dark themes. Dark mode is easier on the eyes in low-light conditions.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={theme === 'dark'}
                      onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                  </label>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                      theme === 'light'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400'
                        : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <span className="font-medium">Light</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 px-4 py-3 rounded-lg border transition-all ${
                      theme === 'dark'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400'
                        : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      <span className="font-medium">Dark</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Demo Mode */}
          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-sky-600 dark:text-sky-400 mb-4">🎭 Demo Mode</h2>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Enable Demo Mode</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Try out the platform with realistic sample data including leads, conversations, campaigns, and flows.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={typeof window !== 'undefined' && localStorage.getItem('demo_mode') === 'true'}
                      onChange={(e) => {
                        if (e.target.checked) {
                          localStorage.setItem('demo_mode', 'true');
                          window.location.reload();
                        } else {
                          localStorage.setItem('demo_mode', 'false');
                          window.location.reload();
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-400/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                  </label>
                </div>

                <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3 mt-3">
                  <h4 className="font-medium text-sky-700 dark:text-sky-400 text-sm mb-2">Demo mode includes:</h4>
                  <ul className="text-sm text-sky-600 dark:text-sky-300 space-y-1 ml-4 list-disc">
                    <li>8 sample leads with various statuses and priorities</li>
                    <li>Realistic conversation threads with messages</li>
                    <li>Active and completed campaigns with statistics</li>
                    <li>Pre-configured conversation flows</li>
                  </ul>
                  <p className="text-xs text-sky-500 dark:text-sky-400 mt-3">
                    💡 Perfect for exploring features, taking screenshots, or demonstrating the platform to clients.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <h2 className="text-xl font-semibold text-sky-600 dark:text-sky-400 mb-4">🌙 Quiet Hours</h2>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Enable Quiet Hours</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Prevent automated messages from being sent outside of specified hours (8am-8pm by default)
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quietHoursEnabled}
                      onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                  </label>
                </div>

                {quietHoursEnabled && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={quietHoursStart}
                          onChange={(e) => setQuietHoursStart(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                          End Time
                        </label>
                        <input
                          type="time"
                          value={quietHoursEnd}
                          onChange={(e) => setQuietHoursEnd(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                          Your Timezone
                        </label>
                        <select
                          value={userTimezone}
                          onChange={(e) => setUserTimezone(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
                        >
                          <option value="America/New_York">Eastern (ET)</option>
                          <option value="America/Chicago">Central (CT)</option>
                          <option value="America/Denver">Mountain (MT)</option>
                          <option value="America/Los_Angeles">Pacific (PT)</option>
                          <option value="America/Phoenix">Arizona (MST)</option>
                          <option value="America/Anchorage">Alaska (AKT)</option>
                          <option value="Pacific/Honolulu">Hawaii (HST)</option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3">
                      <h4 className="font-medium text-sky-700 dark:text-sky-400 text-sm mb-2">How it works:</h4>
                      <ul className="text-sm text-sky-600 dark:text-sky-300 space-y-1 ml-4 list-disc">
                        <li>Messages scheduled outside quiet hours will be delayed until the next allowed window</li>
                        <li>Bulk campaigns and drip sequences respect these time restrictions</li>
                        <li>Times are converted to your local timezone automatically</li>
                        <li>Helps maintain compliance and improve engagement rates</li>
                      </ul>
                    </div>
                  </>
                )}

                <button
                  onClick={handleSaveQuietHours}
                  className="mt-4 px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors"
                >
                  Save Quiet Hours
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="card border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
            <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-4">Danger Zone</h2>

            <div className="space-y-4">
              <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-300 dark:border-red-800">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Delete Account</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
                  Once you delete your account, there is no going back. This will permanently delete:
                </p>
                <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1 mb-4 ml-4 list-disc">
                  <li>Your user profile and settings</li>
                  <li>All contacts and leads</li>
                  <li>All campaigns and messages</li>
                  <li>All points transactions and history</li>
                  <li>All templates and flows</li>
                  <li>Your authentication credentials</li>
                </ul>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-4">
                  This action cannot be undone!
                </p>

                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Delete My Account
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                        Type <span className="font-mono bg-red-200 dark:bg-red-800 px-2 py-1 rounded text-red-700 dark:text-red-300">DELETE MY ACCOUNT</span> to confirm:
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE MY ACCOUNT"
                        className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-red-400 dark:placeholder-red-500"
                        disabled={deletingAccount}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deletingAccount || deleteConfirmText !== 'DELETE MY ACCOUNT'}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingAccount ? 'Deleting...' : 'Yes, Delete My Account'}
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteConfirmText('');
                        }}
                        disabled={deletingAccount}
                        className="px-6 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 font-medium rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Modal */}
      <CustomModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        onConfirm={modalState.onConfirm}
      />
    </div>
  );
}
