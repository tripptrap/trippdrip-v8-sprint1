'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Send, Clock, Users, Tag, Megaphone, Search, Sparkles, ChevronDown, ChevronUp, AlertTriangle, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Lead {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string[];
  campaign_id?: string;
  _contactType?: 'lead' | 'client';
}

interface Campaign {
  id: string;
  name: string;
}

interface BulkComposeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Pre-selected options
  preSelectedLeadIds?: string[];
  preSelectedCampaignId?: string;
  preSelectedTags?: string[];
  // Contact type filter
  contactType?: 'leads' | 'clients' | 'both';
}

type SendMode = 'now' | 'schedule';
type SelectionMode = 'manual' | 'tags' | 'campaign' | 'all';

export default function BulkComposeDrawer({
  isOpen,
  onClose,
  preSelectedLeadIds = [],
  preSelectedCampaignId,
  preSelectedTags = [],
  contactType = 'both',
}: BulkComposeDrawerProps) {
  // Selection state
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(
    preSelectedLeadIds.length > 0 ? 'manual' :
    preSelectedCampaignId ? 'campaign' :
    preSelectedTags.length > 0 ? 'tags' : 'manual'
  );
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set(preSelectedLeadIds));
  const [selectedTags, setSelectedTags] = useState<string[]>(preSelectedTags);
  const [selectedCampaignId, setSelectedCampaignId] = useState(preSelectedCampaignId || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [userCredits, setUserCredits] = useState(0);

  // Compose state
  const [message, setMessage] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // UI state
  const [showLeadSelector, setShowLeadSelector] = useState(true);

  // Load data when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Reset state when pre-selections change
  useEffect(() => {
    if (preSelectedLeadIds.length > 0) {
      setSelectionMode('manual');
      setSelectedLeadIds(new Set(preSelectedLeadIds));
    } else if (preSelectedCampaignId) {
      setSelectionMode('campaign');
      setSelectedCampaignId(preSelectedCampaignId);
    } else if (preSelectedTags.length > 0) {
      setSelectionMode('tags');
      setSelectedTags(preSelectedTags);
    }
  }, [preSelectedLeadIds, preSelectedCampaignId, preSelectedTags]);

  async function loadData() {
    setLoadingData(true);
    try {
      // Build fetch promises based on contact type
      const fetchPromises: Promise<Response>[] = [
        fetch('/api/campaigns'),
        fetch('/api/tags'),
        fetch('/api/user/credits'),
      ];

      // Add leads fetch if needed
      if (contactType === 'leads' || contactType === 'both') {
        fetchPromises.unshift(fetch('/api/leads?limit=1000'));
      }

      // Add clients fetch if needed
      if (contactType === 'clients' || contactType === 'both') {
        fetchPromises.push(fetch('/api/clients?page=1&pageSize=1000'));
      }

      const responses = await Promise.all(fetchPromises);
      const dataPromises = responses.map(r => r.json());
      const results = await Promise.all(dataPromises);

      let allContacts: Lead[] = [];
      let resultIndex = 0;

      // Parse leads if fetched
      if (contactType === 'leads' || contactType === 'both') {
        const leadsData = results[resultIndex++];
        if (leadsData.ok) {
          const leadsWithType = (leadsData.items || []).map((l: any) => ({ ...l, _contactType: 'lead' }));
          allContacts = [...allContacts, ...leadsWithType];
        }
      }

      // Parse campaigns, tags, credits
      const campaignsData = results[resultIndex++];
      const tagsData = results[resultIndex++];
      const creditsData = results[resultIndex++];

      // Parse clients if fetched
      if (contactType === 'clients' || contactType === 'both') {
        const clientsData = results[resultIndex++];
        if (clientsData.ok) {
          const clientsWithType = (clientsData.items || []).map((c: any) => ({ ...c, _contactType: 'client' }));
          allContacts = [...allContacts, ...clientsWithType];
        }
      }

      setLeads(allContacts);
      if (campaignsData.ok) setCampaigns(campaignsData.items || []);
      if (tagsData.ok) setAvailableTags((tagsData.items || []).map((t: any) => t.name));
      if (creditsData.ok) setUserCredits(creditsData.credits || 0);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoadingData(false);
    }
  }

  // Calculate selected leads based on selection mode
  const targetLeads = useMemo(() => {
    let filtered = leads.filter(l => l.phone); // Only leads with phone numbers

    switch (selectionMode) {
      case 'manual':
        return filtered.filter(l => selectedLeadIds.has(l.id));
      case 'tags':
        if (selectedTags.length === 0) return [];
        return filtered.filter(l =>
          l.tags && selectedTags.some(tag => l.tags?.includes(tag))
        );
      case 'campaign':
        if (!selectedCampaignId) return [];
        return filtered.filter(l => l.campaign_id === selectedCampaignId);
      case 'all':
        return filtered;
      default:
        return [];
    }
  }, [leads, selectionMode, selectedLeadIds, selectedTags, selectedCampaignId]);

  // Search filtered leads for manual selection
  const searchFilteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads.filter(l => l.phone);
    const q = searchQuery.toLowerCase();
    return leads.filter(l =>
      l.phone && (
        l.first_name?.toLowerCase().includes(q) ||
        l.last_name?.toLowerCase().includes(q) ||
        l.phone?.includes(q)
      )
    );
  }, [leads, searchQuery]);

  // Calculate costs
  const segments = Math.max(1, Math.ceil(message.length / 160));
  const creditsPerMessage = segments * 2;
  const totalCredits = targetLeads.length * creditsPerMessage;
  const hasEnoughCredits = userCredits >= totalCredits;

  // Personalize message preview
  function getPreview(lead: Lead) {
    return message
      .replace(/\{\{first\}\}/gi, lead.first_name || 'there')
      .replace(/\{\{last\}\}/gi, lead.last_name || '')
      .replace(/\{\{name\}\}/gi, `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'there');
  }

  // AI message suggestion
  async function generateAISuggestion() {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are an SMS marketing assistant. Generate a short, professional, and engaging SMS message. Keep it under 160 characters. Do not use emojis. Include {{first}} placeholder for personalization. Only return the message text, nothing else.'
            },
            {
              role: 'user',
              content: message.trim()
                ? `Improve this message: "${message}"`
                : 'Write a friendly follow-up message for a potential customer'
            }
          ],
        }),
      });
      const data = await res.json();
      if (data.ok && data.reply) {
        setMessage(data.reply);
        toast.success('AI suggestion applied');
      }
    } catch (error) {
      toast.error('Failed to generate suggestion');
    } finally {
      setAiLoading(false);
    }
  }

  // Send messages
  async function handleSend() {
    if (targetLeads.length === 0) {
      toast.error('No leads selected');
      return;
    }
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (!hasEnoughCredits) {
      toast.error(`Insufficient credits. Need ${totalCredits}, have ${userCredits}`);
      return;
    }
    if (sendMode === 'schedule' && !scheduleDate) {
      toast.error('Please select a schedule date');
      return;
    }

    setSending(true);

    try {
      if (sendMode === 'schedule') {
        // Bulk schedule
        const res = await fetch('/api/messages/schedule/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadIds: targetLeads.map(l => l.id),
            body: message,
            scheduledFor: new Date(scheduleDate).toISOString(),
            channel: 'sms',
          }),
        });
        const data = await res.json();
        if (data.ok) {
          toast.success(`${data.scheduled} messages scheduled`);
          handleClose();
        } else {
          toast.error(data.error || 'Failed to schedule');
        }
      } else {
        // Send now - use existing bulk send logic
        let sent = 0;
        let failed = 0;

        for (const lead of targetLeads) {
          try {
            const personalizedMessage = getPreview(lead);
            const res = await fetch('/api/telnyx/send-sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: lead.phone,
                message: personalizedMessage,
                leadId: lead.id,
              }),
            });
            const data = await res.json();
            if (data.success) {
              sent++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
          // Small delay
          await new Promise(r => setTimeout(r, 100));
        }

        if (sent > 0) {
          toast.success(`Sent ${sent} messages${failed > 0 ? `, ${failed} failed` : ''}`);
          handleClose();
        } else {
          toast.error('Failed to send messages');
        }
      }
    } catch (error) {
      toast.error('Error sending messages');
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setMessage('');
    setScheduleDate('');
    setSendMode('now');
    setSelectedLeadIds(new Set());
    setSelectedTags([]);
    setSelectedCampaignId('');
    setSearchQuery('');
    onClose();
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-lg bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-sky-500/10 to-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center">
              <Send className="w-5 h-5 text-sky-500" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Compose Message</h2>
              <p className="text-xs text-slate-500">{targetLeads.length} recipient{targetLeads.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loadingData ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Selection Mode */}
              <div>
                <button
                  onClick={() => setShowLeadSelector(!showLeadSelector)}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Recipients: {targetLeads.length} contact{targetLeads.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {showLeadSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showLeadSelector && (
                  <div className="mt-2 p-3 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                    {/* Selection mode tabs */}
                    <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      {[
                        { mode: 'manual' as const, icon: Users, label: 'Select' },
                        { mode: 'tags' as const, icon: Tag, label: 'By Tag' },
                        { mode: 'campaign' as const, icon: Megaphone, label: 'Campaign' },
                      ].map(({ mode, icon: Icon, label }) => (
                        <button
                          key={mode}
                          onClick={() => setSelectionMode(mode)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-colors ${
                            selectionMode === mode
                              ? 'bg-white dark:bg-slate-700 text-sky-600 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Manual selection */}
                    {selectionMode === 'manual' && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search contacts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {searchFilteredLeads.slice(0, 50).map(lead => (
                            <label
                              key={lead.id}
                              className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(lead.id)}
                                onChange={() => toggleLeadSelection(lead.id)}
                                className="rounded border-slate-300"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex items-center gap-2">
                                {lead.first_name} {lead.last_name} · {lead.phone}
                                {lead._contactType && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    lead._contactType === 'client'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                                  }`}>
                                    {lead._contactType === 'client' ? 'Client' : 'Lead'}
                                  </span>
                                )}
                              </span>
                            </label>
                          ))}
                          {searchFilteredLeads.length > 50 && (
                            <p className="text-xs text-slate-500 p-2">
                              +{searchFilteredLeads.length - 50} more (refine search)
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tag selection */}
                    {selectionMode === 'tags' && (
                      <div className="flex flex-wrap gap-2">
                        {availableTags.length === 0 ? (
                          <p className="text-sm text-slate-500">No tags available</p>
                        ) : (
                          availableTags.map(tag => (
                            <button
                              key={tag}
                              onClick={() => toggleTag(tag)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                selectedTags.includes(tag)
                                  ? 'bg-sky-500 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                              }`}
                            >
                              {tag}
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {/* Campaign selection */}
                    {selectionMode === 'campaign' && (
                      <select
                        value={selectedCampaignId}
                        onChange={(e) => setSelectedCampaignId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 outline-none"
                      >
                        <option value="">Select a campaign...</option>
                        {campaigns.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Message composer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Message</label>
                  <button
                    onClick={generateAISuggestion}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-900/20 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI Suggest
                  </button>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message... Use {{first}}, {{last}}, or {{name}} for personalization"
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-sky-500/20 resize-none"
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{message.length} characters</span>
                  <span>{segments} segment{segments !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Preview */}
              {message && targetLeads[0] && (
                <div className="p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
                  <p className="text-xs font-medium text-sky-600 dark:text-sky-400 mb-1">Preview for {targetLeads[0].first_name}:</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{getPreview(targetLeads[0])}</p>
                </div>
              )}

              {/* Send mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSendMode('now')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors ${
                    sendMode === 'now'
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  Send Now
                </button>
                <button
                  onClick={() => setSendMode('schedule')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors ${
                    sendMode === 'schedule'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Schedule
                </button>
              </div>

              {/* Schedule date picker */}
              {sendMode === 'schedule' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Schedule for
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              )}

              {/* Cost summary */}
              <div className={`p-3 rounded-lg ${hasEnoughCredits ? 'bg-slate-50 dark:bg-slate-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Estimated cost:</span>
                  <span className={`text-sm font-semibold ${hasEnoughCredits ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>
                    {totalCredits} credits
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-500">Your balance:</span>
                  <span className="text-xs text-slate-500">{userCredits} credits</span>
                </div>
                {!hasEnoughCredits && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-red-500">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Insufficient credits
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4">
          <button
            onClick={handleSend}
            disabled={sending || targetLeads.length === 0 || !message.trim() || !hasEnoughCredits || (sendMode === 'schedule' && !scheduleDate)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              sendMode === 'now'
                ? 'bg-sky-500 hover:bg-sky-600 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {sendMode === 'now' ? 'Sending...' : 'Scheduling...'}
              </>
            ) : (
              <>
                {sendMode === 'now' ? <Send className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                {sendMode === 'now' ? `Send to ${targetLeads.length} Lead${targetLeads.length !== 1 ? 's' : ''}` : `Schedule ${targetLeads.length} Message${targetLeads.length !== 1 ? 's' : ''}`}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
