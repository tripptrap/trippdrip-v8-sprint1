"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  tags: string[];
}

interface ScheduledCampaign {
  id: string;
  name: string;
  message: string;
  total_leads: number;
  leads_sent: number;
  percentage_per_batch: number;
  interval_hours: number;
  start_date: string;
  next_batch_date: string;
  auto_repeat: boolean;
  status: 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  created_at: string;
}

export default function ScheduleCampaignPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<ScheduledCampaign[]>([]);
  const [showScheduler, setShowScheduler] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [percentage, setPercentage] = useState(20);
  const [intervalHours, setIntervalHours] = useState(24);
  const [autoRepeat, setAutoRepeat] = useState(true);

  // Filter state
  const [filterTag, setFilterTag] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    fetchLeads();
    fetchScheduledCampaigns();
  }, []);

  async function fetchLeads() {
    try {
      const response = await fetch('/api/leads');
      const data = await response.json();
      if (data.leads) {
        setLeads(data.leads);
        // Extract unique tags
        const tags = new Set<string>();
        data.leads.forEach((lead: Lead) => {
          lead.tags?.forEach((tag: string) => tags.add(tag));
        });
        setAvailableTags(Array.from(tags));
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Failed to load leads');
    }
  }

  async function fetchScheduledCampaigns() {
    try {
      const response = await fetch('/api/campaigns/schedule');
      const data = await response.json();
      if (data.ok) {
        setCampaigns(data.campaigns);
      }
    } catch (error) {
      console.error('Error fetching scheduled campaigns:', error);
    }
  }

  function toggleLead(leadId: string) {
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  }

  function selectAll() {
    const filtered = getFilteredLeads();
    setSelectedLeads(filtered.map(l => l.id));
  }

  function deselectAll() {
    setSelectedLeads([]);
  }

  function getFilteredLeads() {
    if (!filterTag) return leads;
    return leads.filter(lead => lead.tags?.includes(filterTag));
  }

  async function scheduleCampaign() {
    if (!campaignName.trim()) {
      toast.error('Please enter a campaign name');
      return;
    }

    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    if (selectedLeads.length === 0) {
      toast.error('Please select at least one lead');
      return;
    }

    if (!startDate || !startTime) {
      toast.error('Please select start date and time');
      return;
    }

    setLoading(true);
    try {
      const scheduledFor = `${startDate}T${startTime}:00`;
      const response = await fetch('/api/campaigns/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          message,
          leadIds: selectedLeads,
          schedule: {
            startDate: scheduledFor,
            percentage,
            intervalHours,
            repeat: autoRepeat,
          },
          tags: filterTag ? [filterTag] : [],
        }),
      });

      const data = await response.json();

      if (data.ok) {
        toast.success(`Campaign scheduled! Will send to ${data.campaign.leadsPerBatch} leads per batch.`);
        // Reset form
        setCampaignName('');
        setMessage('');
        setSelectedLeads([]);
        setStartDate('');
        setStartTime('');
        setShowScheduler(false);
        // Refresh campaigns
        fetchScheduledCampaigns();
      } else {
        toast.error(data.error || 'Failed to schedule campaign');
      }
    } catch (error) {
      console.error('Error scheduling campaign:', error);
      toast.error('Failed to schedule campaign');
    } finally {
      setLoading(false);
    }
  }

  async function updateCampaignStatus(campaignId: string, action: 'pause' | 'resume' | 'cancel') {
    try {
      const response = await fetch(`/api/campaigns/schedule?id=${campaignId}&action=${action}`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (data.ok) {
        toast.success(data.message);
        fetchScheduledCampaigns();
      } else {
        toast.error(data.error || 'Failed to update campaign');
      }
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast.error('Failed to update campaign');
    }
  }

  const filteredLeads = getFilteredLeads();
  const leadsPerBatch = Math.ceil((selectedLeads.length * percentage) / 100);
  const totalBatches = selectedLeads.length > 0 ? Math.ceil(selectedLeads.length / leadsPerBatch) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Schedule Bulk Campaigns</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Schedule campaigns to send messages to leads over time
          </p>
        </div>
        <button
          onClick={() => setShowScheduler(!showScheduler)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
        >
          {showScheduler ? 'Hide Scheduler' : 'New Scheduled Campaign'}
        </button>
      </div>

      {showScheduler && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Schedule New Campaign</h2>

          {/* Campaign Name */}
          <div>
            <label className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 block">Campaign Name *</label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g., Black Friday Promotion - Week 1"
              className="input-dark w-full px-4 py-2 rounded-lg"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 block">Message *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your message here..."
              rows={4}
              className="input-dark w-full px-4 py-2 rounded-lg resize-none"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{message.length} characters</p>
          </div>

          {/* Lead Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-900">Select Leads *</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-sky-600 hover:text-blue-300"
                >
                  Select All ({filteredLeads.length})
                </button>
                <span className="text-slate-400 dark:text-slate-500">|</span>
                <button
                  onClick={deselectAll}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <div className="mb-3">
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  className="input-dark px-3 py-2 rounded text-sm"
                >
                  <option value="">All Tags</option>
                  {availableTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 max-h-48 overflow-y-auto">
              {filteredLeads.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center py-4">No leads found</p>
              ) : (
                <div className="space-y-2">
                  {filteredLeads.map(lead => (
                    <label key={lead.id} className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLeads.includes(lead.id)}
                        onChange={() => toggleLead(lead.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="text-sm text-gray-900">
                          {lead.first_name} {lead.last_name}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">{lead.phone}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} selected
            </p>
          </div>

          {/* Schedule Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 block">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-dark w-full px-4 py-2 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 block">Start Time *</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input-dark w-full px-4 py-2 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 block">
              Percentage per Batch: {percentage}%
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={percentage}
              onChange={(e) => setPercentage(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Will send to {leadsPerBatch} leads per batch
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 block">
              Hours Between Batches: {intervalHours}h
            </label>
            <input
              type="range"
              min="1"
              max="168"
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {totalBatches} total batches • Estimated completion in {Math.ceil((totalBatches * intervalHours) / 24)} days
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRepeat}
              onChange={(e) => setAutoRepeat(e.target.checked)}
              className="w-4 h-4"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Auto-repeat until all leads are sent</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Automatically schedule the next batch until all selected leads have been contacted
              </div>
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              onClick={scheduleCampaign}
              disabled={loading}
              className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Scheduling...' : 'Schedule Campaign'}
            </button>
            <button
              onClick={() => setShowScheduler(false)}
              className="px-6 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-white/20 text-slate-900 dark:text-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scheduled Campaigns List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Active Scheduled Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-900/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No Scheduled Campaigns</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Create your first scheduled campaign to automate your outreach
            </p>
          </div>
        ) : (
          campaigns.map(campaign => {
            const progress = (campaign.leads_sent / campaign.total_leads) * 100;
            const getStatusColor = (status: string) => {
              switch (status) {
                case 'scheduled': return 'text-sky-600 bg-sky-500/10 border-sky-200';
                case 'running': return 'text-sky-600 bg-sky-500/10 border-sky-200';
                case 'paused': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
                case 'completed': return 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-8000/10 border-gray-500/20';
                case 'cancelled': return 'text-red-400 bg-red-500/10 border-red-500/20';
                default: return 'text-slate-600 dark:text-slate-400 bg-white border-slate-200 dark:border-slate-700';
              }
            };

            return (
              <div key={campaign.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                      <div className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(campaign.status)}`}>
                        {campaign.status.toUpperCase()}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-2 line-clamp-2">{campaign.message}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Progress</span>
                    <span className="text-slate-900 dark:text-slate-100">{campaign.leads_sent} / {campaign.total_leads} leads sent</span>
                  </div>
                  <div className="w-full bg-slate-50 dark:bg-slate-800 rounded-full h-2">
                    <div
                      className="bg-sky-500 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Next Batch:</span>
                      <div className="text-slate-900 dark:text-slate-100">{new Date(campaign.next_batch_date).toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Batch Size:</span>
                      <div className="text-slate-900 dark:text-slate-100">{campaign.percentage_per_batch}% ({Math.ceil((campaign.total_leads * campaign.percentage_per_batch) / 100)} leads)</div>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Interval:</span>
                      <div className="text-slate-900 dark:text-slate-100">Every {campaign.interval_hours}h</div>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Auto-repeat:</span>
                      <div className="text-slate-900 dark:text-slate-100">{campaign.auto_repeat ? 'Yes' : 'No'}</div>
                    </div>
                  </div>

                  {(campaign.status === 'scheduled' || campaign.status === 'running' || campaign.status === 'paused') && (
                    <div className="flex gap-2 pt-2">
                      {campaign.status !== 'paused' && (
                        <button
                          onClick={() => updateCampaignStatus(campaign.id, 'pause')}
                          className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg text-sm transition-colors"
                        >
                          Pause
                        </button>
                      )}
                      {campaign.status === 'paused' && (
                        <button
                          onClick={() => updateCampaignStatus(campaign.id, 'resume')}
                          className="px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 rounded-lg text-sm transition-colors"
                        >
                          Resume
                        </button>
                      )}
                      <button
                        onClick={() => updateCampaignStatus(campaign.id, 'cancel')}
                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
