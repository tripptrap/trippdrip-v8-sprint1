'use client';

import { useState, useEffect } from 'react';
import { spendPoints } from '@/lib/pointsStore';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

type ConversationFlow = {
  id: string;
  name: string;
  steps: Array<{
    id: string;
    yourMessage: string;
    responses: Array<{ label: string; followUpMessage: string }>;
  }>;
};

type Lead = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  campaign?: string;
};

type SendResult = {
  lead: Lead;
  success: boolean;
  error?: string;
};

export default function BulkSMSPage() {
  const [step, setStep] = useState<'filter' | 'compose' | 'review' | 'sending' | 'results'>('filter');
  const [points, setPoints] = useState(0);

  // Filter state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableCampaigns, setAvailableCampaigns] = useState<string[]>([]);
  const [availableFlows, setAvailableFlows] = useState<ConversationFlow[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);

  // Compose state
  const [messageBody, setMessageBody] = useState('');

  // Results state
  const [sendResults, setSendResults] = useState<SendResult[]>([]);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    loadInitialData();

    const handleUpdate = (e: any) => {
      setPoints(e.detail.balance);
    };
    window.addEventListener('pointsUpdated', handleUpdate);
    return () => window.removeEventListener('pointsUpdated', handleUpdate);
  }, []);

  async function loadInitialData() {
    // Load points from Supabase
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('credits')
        .eq('id', user.id)
        .single();

      if (userData) {
        setPoints(userData.credits || 0);
      }
    }

    // Load all leads to get unique tags and campaigns
    try {
      const response = await fetch('/api/leads');
      const leadsData = await response.json();
      if (leadsData.ok && leadsData.items) {
        const tags = new Set<string>();
        const campaigns = new Set<string>();

        leadsData.items.forEach((lead: Lead) => {
          if (lead.tags) {
            lead.tags.forEach(tag => tags.add(tag));
          }
          if (lead.campaign) {
            campaigns.add(lead.campaign);
          }
        });

        setAvailableTags(Array.from(tags).sort());
        setAvailableCampaigns(Array.from(campaigns).sort());
      }
    } catch (error) {
      console.error('Error loading leads:', error);
    }

    // Load flows from API
    try {
      const response = await fetch('/api/flows');
      const data = await response.json();
      if (data.ok && data.items) {
        setAvailableFlows(data.items);
      }
    } catch (error) {
      console.error('Error loading flows:', error);
    }
  }

  async function loadFilteredLeads() {
    if (selectedTags.length === 0 && !selectedCampaign) {
      toast.error('Please select at least one tag or campaign');
      return;
    }

    try {
      const params = new URLSearchParams();
      if (selectedTags.length > 0) {
        params.append('tags', selectedTags.join(','));
      }
      if (selectedCampaign) {
        params.append('campaign', selectedCampaign);
      }

      const response = await fetch(`/api/leads?${params}`);
      const data = await response.json();

      if (data.ok && data.items) {
        const leadsWithPhone = data.items.filter((l: Lead) => l.phone);
        setFilteredLeads(leadsWithPhone);

        if (leadsWithPhone.length === 0) {
          toast.error('No leads found with phone numbers matching these filters');
          return;
        }

        // If a flow is selected, use the first step's message
        if (selectedFlowId) {
          const flow = availableFlows.find(f => f.id === selectedFlowId);
          if (flow && flow.steps && flow.steps.length > 0) {
            setMessageBody(flow.steps[0].yourMessage);
          }
        }

        setStep('compose');
        toast.success(`Found ${leadsWithPhone.length} leads`);
      }
    } catch (error) {
      console.error('Error loading filtered leads:', error);
      toast.error('Failed to load leads');
    }
  }

  function handleNextFromCompose() {
    if (!messageBody.trim()) {
      toast.error('Please enter a message');
      return;
    }
    setStep('review');
  }

  async function handleSendMessages() {
    const totalCost = filteredLeads.length * 2; // 2 points per SMS

    if (points < totalCost) {
      toast.error(`Not enough points. Need ${totalCost}, have ${points}`);
      return;
    }

    setStep('sending');
    setIsSending(true);
    setSendResults([]);

    const results: SendResult[] = [];

    for (const lead of filteredLeads) {
      // Simulate sending (replace with actual Twilio call)
      await new Promise(resolve => setTimeout(resolve, 100));

      const personalizedMessage = messageBody
        .replace(/\{\{first\}\}/gi, lead.first_name || 'there')
        .replace(/\{\{last\}\}/gi, lead.last_name || '')
        .replace(/\{\{name\}\}/gi, `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'there');

      try {
        // Here you would call your SMS API
        // const response = await fetch('/api/sms/send', { ... });

        // Simulated success
        results.push({
          lead,
          success: true
        });

        // Deduct points
        spendPoints(2, `SMS to ${lead.phone}`, 'sms_sent');
      } catch (error: any) {
        results.push({
          lead,
          success: false,
          error: error.message || 'Failed to send'
        });
      }

      setSendResults([...results]);
    }

    setIsSending(false);
    setStep('results');

    const successCount = results.filter(r => r.success).length;
    toast.success(`Sent ${successCount} of ${filteredLeads.length} messages`);
  }

  function resetFlow() {
    setStep('filter');
    setSelectedTags([]);
    setSelectedCampaign('');
    setSelectedFlowId('');
    setFilteredLeads([]);
    setMessageBody('');
    setSendResults([]);
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // FILTER STEP
  if (step === 'filter') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Bulk SMS</h1>
          <p className="text-[var(--muted)] mt-1">Select leads by tags or campaign, then send messages</p>
        </div>

        {/* Points Balance */}
        <div className="card bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-blue-500/30">
          <div className="text-sm text-[var(--muted)] mb-1">Points Balance</div>
          <div className="text-3xl font-bold text-white">{points.toLocaleString()}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Each SMS costs 2 points</div>
        </div>

        {/* Filter by Tags */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">Filter by Tags</h2>
          <p className="text-sm text-[var(--muted)] mb-4">Select one or more tags to target specific lead groups</p>

          {availableTags.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              No tags available. Add tags to your leads first.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter by Campaign */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">Filter by Campaign</h2>
          <p className="text-sm text-[var(--muted)] mb-4">Select a specific campaign (optional)</p>

          {availableCampaigns.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              No campaigns available. Add campaigns to your leads first.
            </div>
          ) : (
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="input-dark w-full px-4 py-3 rounded-lg"
            >
              <option value="">All Campaigns</option>
              {availableCampaigns.map(campaign => (
                <option key={campaign} value={campaign}>{campaign}</option>
              ))}
            </select>
          )}
        </div>

        {/* Select Flow (Optional) */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-3">Use a Flow (Optional)</h2>
          <p className="text-sm text-[var(--muted)] mb-4">Pre-fill your message with a conversation flow</p>

          {availableFlows.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              No flows created yet. Create flows in the Flows page.
            </div>
          ) : (
            <select
              value={selectedFlowId}
              onChange={(e) => setSelectedFlowId(e.target.value)}
              className="input-dark w-full px-4 py-3 rounded-lg"
            >
              <option value="">None - Write custom message</option>
              {availableFlows.map(flow => (
                <option key={flow.id} value={flow.id}>{flow.name}</option>
              ))}
            </select>
          )}

          {selectedFlowId && (
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-300">
                The first message from this flow will be used. You can edit it in the next step.
              </p>
            </div>
          )}
        </div>

        {/* Continue Button */}
        <div className="flex gap-3">
          <button
            onClick={loadFilteredLeads}
            disabled={selectedTags.length === 0 && !selectedCampaign}
            className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Continue to Compose
          </button>
        </div>
      </div>
    );
  }

  // COMPOSE STEP
  if (step === 'compose') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('filter')} className="text-[var(--muted)] hover:text-white">
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white">Compose Message</h1>
            <p className="text-[var(--muted)] mt-1">Write your message for {filteredLeads.length} leads</p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-white/5 text-[var(--muted)] text-sm">1. Filter</div>
          <div className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm">2. Compose</div>
          <div className="px-3 py-1 rounded-full bg-white/5 text-[var(--muted)] text-sm">3. Review</div>
          <div className="px-3 py-1 rounded-full bg-white/5 text-[var(--muted)] text-sm">4. Send</div>
        </div>

        {/* Selected Filters Summary */}
        <div className="card bg-white/5">
          <h3 className="text-sm font-medium text-white mb-2">Selected Filters:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedTags.map(tag => (
              <span key={tag} className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">
                {tag}
              </span>
            ))}
            {selectedCampaign && (
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
                Campaign: {selectedCampaign}
              </span>
            )}
          </div>
        </div>

        {/* Message Compose */}
        <div className="card">
          <label className="block text-sm font-medium text-white mb-2">Message</label>
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            placeholder="Type your message here... Use {{first}}, {{last}}, or {{name}} for personalization"
            className="input-dark w-full px-4 py-3 rounded-lg resize-none"
            rows={6}
          />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">
              {messageBody.length} characters
            </span>
            <span className="text-[var(--muted)]">
              Approx. {Math.ceil(messageBody.length / 160)} SMS segment(s)
            </span>
          </div>
        </div>

        {/* Preview */}
        {messageBody && filteredLeads[0] && (
          <div className="card bg-blue-500/10 border-blue-500/20">
            <h3 className="text-sm font-medium text-blue-300 mb-2">Preview (for {filteredLeads[0].first_name}):</h3>
            <p className="text-white">
              {messageBody
                .replace(/\{\{first\}\}/gi, filteredLeads[0].first_name || 'there')
                .replace(/\{\{last\}\}/gi, filteredLeads[0].last_name || '')
                .replace(/\{\{name\}\}/gi, `${filteredLeads[0].first_name || ''} ${filteredLeads[0].last_name || ''}`.trim() || 'there')}
            </p>
          </div>
        )}

        {/* Continue Button */}
        <div className="flex gap-3">
          <button
            onClick={() => setStep('filter')}
            className="px-6 py-3 bg-white/5 text-white rounded-lg hover:bg-white/10"
          >
            Back to Filters
          </button>
          <button
            onClick={handleNextFromCompose}
            disabled={!messageBody.trim()}
            className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Review Before Sending
          </button>
        </div>
      </div>
    );
  }

  // REVIEW STEP
  if (step === 'review') {
    const totalCost = filteredLeads.length * 2;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('compose')} className="text-[var(--muted)] hover:text-white">
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white">Review & Send</h1>
            <p className="text-[var(--muted)] mt-1">Review your bulk SMS campaign before sending</p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-white/5 text-[var(--muted)] text-sm">1. Filter</div>
          <div className="px-3 py-1 rounded-full bg-white/5 text-[var(--muted)] text-sm">2. Compose</div>
          <div className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm">3. Review</div>
          <div className="px-3 py-1 rounded-full bg-white/5 text-[var(--muted)] text-sm">4. Send</div>
        </div>

        {/* Summary Card */}
        <div className="card bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-blue-500/30">
          <h2 className="text-lg font-semibold text-white mb-4">Campaign Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-[var(--muted)]">Recipients</div>
              <div className="text-2xl font-bold text-white">{filteredLeads.length}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">Total Cost</div>
              <div className="text-2xl font-bold text-white">{totalCost} points</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">Current Balance</div>
              <div className="text-2xl font-bold text-white">{points} points</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">After Sending</div>
              <div className={`text-2xl font-bold ${points - totalCost < 100 ? 'text-orange-400' : 'text-green-400'}`}>
                {points - totalCost} points
              </div>
            </div>
          </div>
        </div>

        {/* Message Preview */}
        <div className="card">
          <h3 className="text-sm font-medium text-white mb-2">Message:</h3>
          <div className="bg-white/5 rounded-lg p-4">
            <p className="text-white whitespace-pre-wrap">{messageBody}</p>
          </div>
        </div>

        {/* Filters Summary */}
        <div className="card">
          <h3 className="text-sm font-medium text-white mb-2">Targeting:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedTags.map(tag => (
              <span key={tag} className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">
                {tag}
              </span>
            ))}
            {selectedCampaign && (
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm">
                Campaign: {selectedCampaign}
              </span>
            )}
          </div>
        </div>

        {/* Warning if low balance */}
        {points < totalCost && (
          <div className="card bg-red-500/10 border-red-500/30">
            <p className="text-red-400 font-medium">Insufficient points!</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              You need {totalCost} points but only have {points}. Please purchase more points to continue.
            </p>
          </div>
        )}

        {/* Send Button */}
        <div className="flex gap-3">
          <button
            onClick={() => setStep('compose')}
            className="px-6 py-3 bg-white/5 text-white rounded-lg hover:bg-white/10"
          >
            Back to Edit
          </button>
          <button
            onClick={handleSendMessages}
            disabled={points < totalCost}
            className="flex-1 bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Send {filteredLeads.length} Messages
          </button>
        </div>
      </div>
    );
  }

  // SENDING STEP
  if (step === 'sending') {
    const successCount = sendResults.filter(r => r.success).length;
    const failedCount = sendResults.filter(r => !r.success).length;
    const progress = (sendResults.length / filteredLeads.length) * 100;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sending Messages</h1>
          <p className="text-[var(--muted)] mt-1">Please wait while we send your messages...</p>
        </div>

        {/* Progress */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--muted)]">Progress</span>
            <span className="text-sm font-medium text-white">{sendResults.length} / {filteredLeads.length}</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-[var(--muted)]">Sent</div>
              <div className="text-xl font-bold text-green-400">{successCount}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">Failed</div>
              <div className="text-xl font-bold text-red-400">{failedCount}</div>
            </div>
          </div>
        </div>

        {/* Live Results */}
        <div className="card">
          <h3 className="text-sm font-medium text-white mb-3">Recent Activity:</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sendResults.slice(-10).reverse().map((result, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg ${result.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">
                    {result.lead.first_name} {result.lead.last_name} - {result.lead.phone}
                  </span>
                  <span className={`text-xs ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                    {result.success ? 'Sent' : 'Failed'}
                  </span>
                </div>
                {result.error && (
                  <div className="text-xs text-red-400 mt-1">{result.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // RESULTS STEP
  if (step === 'results') {
    const successCount = sendResults.filter(r => r.success).length;
    const failedCount = sendResults.filter(r => !r.success).length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Campaign Complete</h1>
          <p className="text-[var(--muted)] mt-1">Your bulk SMS campaign has finished sending</p>
        </div>

        {/* Results Summary */}
        <div className="card bg-gradient-to-br from-green-500/20 to-blue-500/20 border-green-500/30">
          <h2 className="text-lg font-semibold text-white mb-4">Results</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-[var(--muted)]">Total Sent</div>
              <div className="text-2xl font-bold text-white">{filteredLeads.length}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">Successful</div>
              <div className="text-2xl font-bold text-green-400">{successCount}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">Failed</div>
              <div className="text-2xl font-bold text-red-400">{failedCount}</div>
            </div>
          </div>
        </div>

        {/* Failed Messages */}
        {failedCount > 0 && (
          <div className="card">
            <h3 className="text-sm font-medium text-white mb-3">Failed Messages:</h3>
            <div className="space-y-2">
              {sendResults.filter(r => !r.success).map((result, idx) => (
                <div key={idx} className="p-3 bg-red-500/10 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">
                      {result.lead.first_name} {result.lead.last_name} - {result.lead.phone}
                    </span>
                  </div>
                  {result.error && (
                    <div className="text-xs text-red-400 mt-1">{result.error}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={resetFlow}
            className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 font-medium"
          >
            Send Another Campaign
          </button>
        </div>
      </div>
    );
  }

  return null;
}
