'use client';

import { useEffect, useState } from 'react';
import {
  loadSettings,
  updateTwilioConfig,
  updateSpamProtection,
  updateAutoRefill,
  updateEmailConfig,
  addPhoneNumber,
  removePhoneNumber,
  getPhoneNumberSid,
  type Settings,
  type PurchasedNumber,
  type EmailConfig
} from '@/lib/settingsStore';

type AvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
};

export default function Page() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeTab, setActiveTab] = useState<'sms' | 'email' | 'spam' | 'autorefill' | 'numbers'>('sms');
  const [saveMessage, setSaveMessage] = useState('');

  // Twilio account creation
  const [creatingAccount, setCreatingAccount] = useState(false);

  // Spam protection form
  const [spamEnabled, setSpamEnabled] = useState(true);
  const [blockOnHighRisk, setBlockOnHighRisk] = useState(true);
  const [maxHourly, setMaxHourly] = useState(100);
  const [maxDaily, setMaxDaily] = useState(1000);

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

  // Phone number search
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [purchasingNumber, setPurchasingNumber] = useState<string | null>(null);

  useEffect(() => {
    const data = loadSettings();
    setSettings(data);

    setSpamEnabled(data.spamProtection.enabled);
    setBlockOnHighRisk(data.spamProtection.blockOnHighRisk);
    setMaxHourly(data.spamProtection.maxHourlyMessages);
    setMaxDaily(data.spamProtection.maxDailyMessages);

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

    // Listen for updates
    const handler = (e: any) => {
      setSettings(e.detail);
    };
    window.addEventListener('settingsUpdated', handler);
    return () => window.removeEventListener('settingsUpdated', handler);
  }, []);

  const handleCreateTwilioAccount = async () => {
    setCreatingAccount(true);

    try {
      const response = await fetch('/api/twilio/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendlyName: 'TrippDrip User Account'
        })
      });

      const result = await response.json();

      if (result.setup) {
        alert('Twilio integration not configured. Please add TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN to your .env.local file.');
        setCreatingAccount(false);
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create account');
      }

      // Save the new account credentials
      updateTwilioConfig({
        accountSid: result.accountSid,
        authToken: result.authToken,
        phoneNumbers: [],
        purchasedNumbers: []
      });

      const updated = loadSettings();
      setSettings(updated);

      showSaveMessage('Twilio account created successfully! Now you can purchase phone numbers.');
      setActiveTab('numbers');

    } catch (error: any) {
      console.error('Error creating Twilio account:', error);
      alert('Error: ' + error.message);
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleSearchNumbers = async () => {
    if (!settings?.twilio) {
      alert('Please create a Twilio account first');
      return;
    }

    setSearchingNumbers(true);
    setAvailableNumbers([]);

    try {
      const response = await fetch('/api/twilio/search-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: settings.twilio.accountSid,
          authToken: settings.twilio.authToken,
          countryCode: 'US',
          areaCode: areaCode || undefined
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to search numbers');
      }

      setAvailableNumbers(result.numbers);
      if (result.numbers.length === 0) {
        alert('No numbers found. Try a different area code.');
      }

    } catch (error: any) {
      console.error('Error searching numbers:', error);
      alert('Error: ' + error.message);
    } finally {
      setSearchingNumbers(false);
    }
  };

  const handlePurchaseNumber = async (phoneNumber: string) => {
    if (!settings?.twilio) {
      alert('Twilio not configured');
      return;
    }

    if (!confirm(`Purchase ${phoneNumber} for approximately $1/month?`)) {
      return;
    }

    setPurchasingNumber(phoneNumber);

    try {
      const response = await fetch('/api/twilio/purchase-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: settings.twilio.accountSid,
          authToken: settings.twilio.authToken,
          phoneNumber
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to purchase number');
      }

      // Add to settings
      addPhoneNumber(result.phoneNumber, result.sid, result.friendlyName);

      const updated = loadSettings();
      setSettings(updated);

      // Remove from available list
      setAvailableNumbers(prev => prev.filter(n => n.phoneNumber !== phoneNumber));

      showSaveMessage(`Successfully purchased ${phoneNumber}!`);

    } catch (error: any) {
      console.error('Error purchasing number:', error);
      alert('Error: ' + error.message);
    } finally {
      setPurchasingNumber(null);
    }
  };

  const handleReleaseNumber = async (phoneNumber: string) => {
    if (!settings?.twilio) return;

    if (!confirm(`Release ${phoneNumber}? This will cancel your subscription to this number.`)) {
      return;
    }

    const sid = getPhoneNumberSid(phoneNumber);
    if (!sid) {
      alert('Could not find SID for this number');
      return;
    }

    try {
      const response = await fetch('/api/twilio/release-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: settings.twilio.accountSid,
          authToken: settings.twilio.authToken,
          phoneSid: sid
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to release number');
      }

      // Remove from settings
      removePhoneNumber(phoneNumber);

      const updated = loadSettings();
      setSettings(updated);

      showSaveMessage(`Released ${phoneNumber} successfully`);

    } catch (error: any) {
      console.error('Error releasing number:', error);
      alert('Error: ' + error.message);
    }
  };

  const saveSpamSettings = () => {
    updateSpamProtection({
      enabled: spamEnabled,
      blockOnHighRisk,
      maxHourlyMessages: maxHourly,
      maxDailyMessages: maxDaily
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

  const saveEmailSettings = () => {
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

    updateEmailConfig(config);
    const updated = loadSettings();
    setSettings(updated);
    showSaveMessage('Email settings saved!');
  };

  const showSaveMessage = (msg: string) => {
    setSaveMessage(msg);
    setTimeout(() => setSaveMessage(''), 3000);
  };

  if (!settings) return <div>Loading...</div>;

  const hasTwilioAccount = !!settings.twilio?.accountSid;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {saveMessage && (
          <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg">
            {saveMessage}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('sms')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'sms'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          SMS Provider
        </button>
        <button
          onClick={() => setActiveTab('numbers')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'numbers'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Phone Numbers
        </button>
        <button
          onClick={() => setActiveTab('email')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'email'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Email
        </button>
        <button
          onClick={() => setActiveTab('spam')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'spam'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Spam Protection
        </button>
        <button
          onClick={() => setActiveTab('autorefill')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'autorefill'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Auto-Refill
        </button>
      </div>

      {/* SMS Provider Tab */}
      {activeTab === 'sms' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">SMS Account Status</h2>
            <p className="text-gray-600 mb-4">
              Your SMS account is automatically created when you purchase your first point pack.
            </p>
          </div>

          {!hasTwilioAccount ? (
            <div className="space-y-4">
              <div className="p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
                <h3 className="text-lg font-semibold mb-2 text-blue-900">SMS Account Not Active</h3>
                <p className="text-blue-800 mb-4">
                  Purchase any point pack to automatically activate your SMS account and start sending messages!
                </p>
                <a
                  href="/points"
                  className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
                >
                  Buy Points & Activate SMS →
                </a>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">What's included with your first purchase?</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Points for sending messages and using AI</li>
                  <li>• Dedicated SMS account (Twilio subaccount)</li>
                  <li>• Account SID and Auth Token (auto-configured)</li>
                  <li>• Ability to purchase phone numbers</li>
                  <li>• Start sending SMS immediately</li>
                  <li>• No separate account creation needed</li>
                </ul>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <h3 className="font-medium text-yellow-800 mb-2">How It Works</h3>
                <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
                  <li>Choose a point pack (Starter, Pro, Business, or Enterprise)</li>
                  <li>Complete payment via Stripe</li>
                  <li>Your SMS account is created automatically</li>
                  <li>Points are added to your balance</li>
                  <li>Go to Phone Numbers tab to purchase numbers</li>
                  <li>Start sending SMS right away!</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-900 mb-2">SMS Account Active</h3>
                <div className="text-sm text-green-800 space-y-1">
                  <p><strong>Account SID:</strong> {settings.twilio?.accountSid}</p>
                  <p><strong>Status:</strong> Active & Ready</p>
                  <p><strong>Phone Numbers:</strong> {settings.twilio?.purchasedNumbers?.length || 0} purchased</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('numbers')}
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
                >
                  Manage Phone Numbers →
                </button>
                <a
                  href="/points"
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600"
                >
                  Buy More Points
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phone Numbers Tab */}
      {activeTab === 'numbers' && (
        <div className="space-y-6">
          {!hasTwilioAccount ? (
            <div className="card">
              <div className="p-6 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-yellow-800">
                  Please create a Twilio account first in the SMS Provider tab.
                </p>
                <button
                  onClick={() => setActiveTab('sms')}
                  className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                  Go to SMS Provider
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Your Numbers */}
              <div className="card space-y-4">
                <h2 className="text-xl font-semibold">Your Phone Numbers</h2>
                {settings.twilio?.purchasedNumbers && settings.twilio.purchasedNumbers.length > 0 ? (
                  <div className="space-y-2">
                    {settings.twilio.purchasedNumbers.map((number) => (
                      <div
                        key={number.phoneNumber}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                      >
                        <div>
                          <div className="font-mono font-semibold text-lg">{number.phoneNumber}</div>
                          <div className="text-sm text-gray-600">
                            {number.friendlyName} • Added {new Date(number.dateCreated || '').toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleReleaseNumber(number.phoneNumber)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium px-4 py-2 border border-red-500 rounded-lg hover:bg-red-50"
                        >
                          Release Number
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-600">
                    No phone numbers yet. Search and purchase numbers below.
                  </div>
                )}
              </div>

              {/* Search & Purchase */}
              <div className="card space-y-4">
                <h2 className="text-xl font-semibold">Purchase New Numbers</h2>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value)}
                    placeholder="Area code (optional, e.g., 415)"
                    className="flex-1 px-4 py-2 border rounded-lg"
                    maxLength={3}
                  />
                  <button
                    onClick={handleSearchNumbers}
                    disabled={searchingNumbers}
                    className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    {searchingNumbers ? 'Searching...' : 'Search Available Numbers'}
                  </button>
                </div>

                {availableNumbers.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-medium">Available Numbers ({availableNumbers.length})</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {availableNumbers.map((number) => (
                        <div
                          key={number.phoneNumber}
                          className="flex items-center justify-between p-3 bg-white border rounded-lg hover:border-blue-300"
                        >
                          <div>
                            <div className="font-mono font-semibold">{number.phoneNumber}</div>
                            <div className="text-sm text-gray-600">
                              {number.locality}, {number.region}
                              {' • '}
                              {number.capabilities.sms && 'SMS '}
                              {number.capabilities.mms && 'MMS '}
                              {number.capabilities.voice && 'Voice'}
                            </div>
                          </div>
                          <button
                            onClick={() => handlePurchaseNumber(number.phoneNumber)}
                            disabled={purchasingNumber === number.phoneNumber}
                            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm font-medium"
                          >
                            {purchasingNumber === number.phoneNumber ? 'Purchasing...' : 'Purchase (~$1/mo)'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Spam Protection Tab */}
      {activeTab === 'spam' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Spam Protection</h2>
            <p className="text-gray-600 mb-4">
              Configure spam detection and rate limiting to protect your sender reputation.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium">Enable Spam Protection</h3>
                <p className="text-sm text-gray-600">
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
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium">Block High Risk Messages</h3>
                <p className="text-sm text-gray-600">
                  Prevent sending of messages with critical spam scores
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockOnHighRisk}
                  onChange={(e) => setBlockOnHighRisk(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Max Messages Per Hour: {maxHourly}
              </label>
              <input
                type="range"
                min="10"
                max="500"
                value={maxHourly}
                onChange={(e) => setMaxHourly(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Max Messages Per Day: {maxDaily}
              </label>
              <input
                type="range"
                min="100"
                max="5000"
                value={maxDaily}
                onChange={(e) => setMaxDaily(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <button
              onClick={saveSpamSettings}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
            >
              Save Spam Settings
            </button>
          </div>
        </div>
      )}

      {/* Auto-Refill Tab */}
      {activeTab === 'autorefill' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Auto-Refill Points</h2>
            <p className="text-gray-600 mb-4">
              Automatically purchase more points when your balance gets low.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium">Enable Auto-Refill</h3>
                <p className="text-sm text-gray-600">
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
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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
                className="w-full px-3 py-2 border rounded-lg"
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
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-sm text-gray-500 mt-1">
                Estimated cost: ${(autoRefillAmount * 0.01).toFixed(2)}
              </p>
            </div>

            <button
              onClick={saveAutoRefillSettings}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
            >
              Save Auto-Refill Settings
            </button>

            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <h3 className="font-medium text-yellow-800 mb-2">Note</h3>
              <p className="text-sm text-yellow-700">
                Auto-refill requires Stripe integration. You'll be charged automatically when
                your balance drops below the threshold.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Email Configuration Tab */}
      {activeTab === 'email' && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Email Configuration</h2>
            <p className="text-gray-600 mb-4">
              Configure email settings to send welcome emails to new leads automatically.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email Provider</label>
              <select
                value={emailProvider}
                onChange={(e) => setEmailProvider(e.target.value as 'smtp' | 'sendgrid' | 'none')}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="none">None (Disabled)</option>
                <option value="smtp">SMTP</option>
                <option value="sendgrid">SendGrid</option>
              </select>
            </div>

            {/* Common email fields */}
            {emailProvider !== 'none' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">From Email *</label>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="noreply@yourdomain.com"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">From Name *</label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Your Company Name"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Reply-To Email (Optional)</label>
                  <input
                    type="email"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="support@yourdomain.com"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </>
            )}

            {/* SMTP specific fields */}
            {emailProvider === 'smtp' && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-medium mb-3">SMTP Settings</h3>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Host *</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Port *</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    placeholder="587"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">Common ports: 587 (TLS), 465 (SSL), 25 (Unsecured)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Username *</label>
                  <input
                    type="text"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="your-email@gmail.com"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Password *</label>
                  <input
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="smtpSecure"
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="smtpSecure" className="text-sm">
                    Use SSL/TLS (Port 465)
                  </label>
                </div>
              </>
            )}

            {/* SendGrid specific fields */}
            {emailProvider === 'sendgrid' && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-medium mb-3">SendGrid Settings</h3>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">SendGrid API Key *</label>
                  <input
                    type="password"
                    value={sendgridApiKey}
                    onChange={(e) => setSendgridApiKey(e.target.value)}
                    placeholder="SG.••••••••"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Get your API key from <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" className="text-blue-600 hover:underline">SendGrid Dashboard</a>
                  </p>
                </div>
              </>
            )}

            {emailProvider !== 'none' && (
              <>
                <button
                  onClick={saveEmailSettings}
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
                >
                  Save Email Settings
                </button>

                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-medium text-blue-900 mb-2">How Email Works</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Welcome emails are automatically sent when new leads are imported</li>
                    <li>• Each email costs 0.5 points (deducted from your balance)</li>
                    <li>• Emails are only sent to leads that have an email address</li>
                    <li>• View sent emails on the <a href="/email" className="font-medium underline">Email page</a></li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
