'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CustomModal from "@/components/CustomModal";

type Flow = {
  id: string;
  name: string;
  description?: string;
  steps?: any[];
};

type Tag = {
  id: string;
  name: string;
  color: string;
};

type Campaign = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  flow_id?: string;
  status?: string;
  // Computed/display fields
  tags: string[];
  lead_ids: string[];
  lead_count: number;
  messages_sent?: number;
  credits_used?: number;
};

type ModalState = {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  // Create campaign modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit campaign modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editCampaignName, setEditCampaignName] = useState('');
  const [editFlowId, setEditFlowId] = useState('');
  const [saving, setSaving] = useState(false);

  // Flows state
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);

  // Tags state
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#22c55e');
  const [creatingTag, setCreatingTag] = useState(false);

  const tagColors = [
    { color: '#ef4444', name: 'Red' },
    { color: '#f59e0b', name: 'Orange' },
    { color: '#eab308', name: 'Yellow' },
    { color: '#22c55e', name: 'Green' },
    { color: '#14b8a6', name: 'Teal' },
    { color: '#3b82f6', name: 'Blue' },
    { color: '#8b5cf6', name: 'Purple' },
    { color: '#ec4899', name: 'Pink' },
  ];

  useEffect(() => {
    loadCampaigns();
    loadFlows();
    loadTags();
  }, []);

  async function loadFlows() {
    setLoadingFlows(true);
    try {
      const response = await fetch('/api/flows');
      const data = await response.json();
      if (data.ok) {
        setFlows(data.items || []);
      }
    } catch (error) {
      console.error('Error loading flows:', error);
    } finally {
      setLoadingFlows(false);
    }
  }

  async function loadTags() {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      if (data.ok) {
        setAvailableTags(data.items || []);
      }
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  }

  async function createNewTag(tagName: string) {
    if (!tagName.trim()) return;

    setCreatingTag(true);
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tagName.trim(), color: newTagColor })
      });

      const data = await response.json();
      if (data.ok) {
        await loadTags();
        setSelectedTags(prev => [...prev, tagName.trim()]);
        setNewTagName('');
        setNewTagColor('#22c55e'); // Reset to default
      }
    } catch (error) {
      console.error('Error creating tag:', error);
    } finally {
      setCreatingTag(false);
    }
  }

  function toggleTag(tagName: string, isEdit = false) {
    if (isEdit) {
      setEditTags(prev =>
        prev.includes(tagName)
          ? prev.filter(t => t !== tagName)
          : [...prev, tagName]
      );
    } else {
      setSelectedTags(prev =>
        prev.includes(tagName)
          ? prev.filter(t => t !== tagName)
          : [...prev, tagName]
      );
    }
  }

  async function createCampaign() {
    if (!newCampaignName.trim()) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Please enter a campaign name'
      });
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampaignName.trim(),
          flowId: selectedFlowId || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined
        })
      });

      const data = await response.json();

      if (data.ok) {
        setCreateOpen(false);
        setNewCampaignName('');
        setSelectedFlowId('');
        setSelectedTags([]);
        await loadCampaigns();
        setModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: `Campaign "${newCampaignName.trim()}" created successfully!`
        });
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to create campaign'
        });
      }
    } catch (error: any) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.message || 'Failed to create campaign'
      });
    } finally {
      setCreating(false);
    }
  }

  async function loadCampaigns() {
    setLoading(true);
    try {
      // Check if demo mode is active
      const isDemoMode = typeof window !== 'undefined' && localStorage.getItem('demo_mode') === 'true';

      if (isDemoMode) {
        // Use demo data
        const { getDemoCampaigns } = await import('@/lib/demoData');
        const demoCampaigns = getDemoCampaigns();

        // Transform demo campaigns to match Campaign type
        const transformedCampaigns = demoCampaigns.map((campaign: any) => ({
          id: campaign.id,
          name: campaign.name,
          created_at: campaign.created_at,
          updated_at: campaign.created_at,
          tags: campaign.type === 'drip' ? ['Health Insurance'] : ['Auto Insurance'],
          lead_ids: [],
          lead_count: Math.floor(campaign.total_sent * 0.8),
          messages_sent: campaign.total_sent,
          credits_used: campaign.total_sent,
        }));

        setCampaigns(transformedCampaigns);
      } else {
        // Fetch real data
        const response = await fetch('/api/campaigns');
        const data = await response.json();
        if (data.ok) {
          // Transform campaigns to add default display fields
          const transformedCampaigns = (data.items || []).map((c: any) => ({
            ...c,
            tags: c.tags || [],
            lead_ids: c.lead_ids || [],
            lead_count: c.lead_count || 0,
            messages_sent: c.messages_sent || 0,
            credits_used: c.credits_used || 0,
          }));
          setCampaigns(transformedCampaigns);
        }
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(campaign: Campaign) {
    setEditingCampaign(campaign);
    setEditCampaignName(campaign.name);
    setEditFlowId(campaign.flow_id || '');
    setEditTags(campaign.tags || []);
    setEditOpen(true);
  }

  async function saveEditCampaign() {
    if (!editingCampaign || !editCampaignName.trim()) return;

    setSaving(true);
    try {
      const response = await fetch('/api/campaigns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCampaign.id,
          name: editCampaignName.trim(),
          flow_id: editFlowId || null,
          tags: editTags
        })
      });

      const data = await response.json();

      if (data.ok) {
        setEditOpen(false);
        setEditingCampaign(null);
        setEditTags([]);
        await loadCampaigns();
        setModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: 'Campaign updated successfully!'
        });
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to update campaign'
        });
      }
    } catch (error: any) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.message || 'Failed to update campaign'
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCampaign(id: string, name: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Campaign',
      message: `Are you sure you want to delete campaign "${name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/campaigns/delete?id=${id}`, {
            method: 'DELETE',
          });
          const data = await response.json();

          if (data.ok) {
            await loadCampaigns();
          } else {
            setModal({
              isOpen: true,
              type: 'error',
              title: 'Error',
              message: `Error: ${data.error || 'Failed to delete campaign'}`
            });
          }
        } catch (error) {
          console.error('Error deleting campaign:', error);
          setModal({
            isOpen: true,
            type: 'error',
            title: 'Error',
            message: 'Failed to delete campaign'
          });
        }
      }
    });
  }

  const filteredCampaigns = campaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    campaign.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        onConfirm={modal.onConfirm}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.type === 'confirm' ? 'Confirm' : 'OK'}
        cancelText="Cancel"
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">View and manage your SMS campaigns</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/campaigns/schedule"
            className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-500 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule Campaign
          </Link>
          <button
            onClick={() => setCreateOpen(true)}
            className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Campaign
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search campaigns by name or tag..."
          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Campaigns</div>
          <div className="text-3xl font-bold text-gray-900">{campaigns.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Leads</div>
          <div className="text-3xl font-bold text-gray-900">
            {campaigns.reduce((sum, c) => sum + (c.lead_count || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Messages Sent</div>
          <div className="text-3xl font-bold text-gray-900">
            {campaigns.reduce((sum, c) => sum + (c.messages_sent || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Credits Used</div>
          <div className="text-3xl font-bold text-sky-600">
            {campaigns.reduce((sum, c) => sum + (c.credits_used || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Active Tags</div>
          <div className="text-3xl font-bold text-gray-900">
            {new Set(campaigns.flatMap(c => c.tags || [])).size}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Archived</div>
          <div className="text-3xl font-bold text-slate-500 dark:text-slate-400">
            {campaigns.filter(c => c.status === 'archived').length}
          </div>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading campaigns...</div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-600 dark:text-slate-400 mb-4">
              {searchQuery ? 'No campaigns found matching your search.' : 'No campaigns yet.'}
            </div>
            {!searchQuery && (
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-block bg-sky-500 text-white px-6 py-2 rounded-lg hover:bg-sky-600"
              >
                Create Your First Campaign
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Campaign Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Flow</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Tags Applied</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Leads</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Messages Sent</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Credits Used</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Created</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Last Updated</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#223246]">
                {filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-slate-50 dark:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{campaign.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{campaign.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      {campaign.flow_id ? (
                        <span className="inline-block px-2 py-1 text-xs bg-sky-900/30 text-sky-300 border border-sky-700 rounded">
                          {flows.find(f => f.id === campaign.flow_id)?.name || 'Unknown Flow'}
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400 text-sm">No flow</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {campaign.tags && campaign.tags.length > 0 ? (
                          campaign.tags.map((tag) => {
                            const tagData = availableTags.find(t => t.name === tag);
                            const tagColor = tagData?.color || '#3b82f6';
                            return (
                              <span
                                key={tag}
                                className="inline-block px-2 py-1 text-xs rounded border"
                                style={{
                                  backgroundColor: tagColor + '30',
                                  color: tagColor,
                                  borderColor: tagColor + '50'
                                }}
                              >
                                {tag}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 text-sm">No tags</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium text-gray-900">{campaign.lead_count || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium text-gray-900">{campaign.messages_sent || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium text-sky-600">{campaign.credits_used || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(campaign.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => openEditModal(campaign)}
                          className="text-sky-600 hover:text-sky-300 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCampaign(campaign.id, campaign.name)}
                          className="text-red-400 hover:text-red-300 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help */}
      <div className="card bg-blue-50 border-sky-700/50">
        <h3 className="font-semibold mb-2 text-gray-900">💡 Campaign Tips</h3>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <li>• Tag your leads to organize them into campaigns</li>
          <li>• Track messages sent and lead engagement</li>
          <li>• Use the <Link href="/leads" className="text-sky-600 hover:underline">Leads</Link> page to filter by campaign tags</li>
          <li>• Create automated messaging workflows in <Link href="/templates" className="text-sky-600 hover:underline">Templates</Link></li>
        </ul>
      </div>

      {/* Create Campaign Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Create New Campaign</h2>
              <button
                onClick={() => { setCreateOpen(false); setNewCampaignName(''); setSelectedFlowId(''); }}
                className="text-slate-600 dark:text-slate-400 hover:text-gray-900"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Campaign Name</label>
                <input
                  type="text"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Enter campaign name..."
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400 focus:outline-none focus:border-sky-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && !creating) createCampaign(); }}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">AI Flow (Optional)</label>
                {flows.length > 0 ? (
                  <select
                    value={selectedFlowId}
                    onChange={(e) => setSelectedFlowId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">No flow selected</option>
                    {flows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">No flows created yet</span>
                    <Link
                      href="/templates"
                      className="text-sm text-sky-600 hover:underline"
                    >
                      Create a flow
                    </Link>
                  </div>
                )}
              </div>

              {/* Tags Selection */}
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Tags (Optional)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        selectedTags.includes(tag.name)
                          ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-[#0e1623]'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: tag.color + '30', color: tag.color, borderColor: tag.color }}
                    >
                      {tag.name}
                      {selectedTags.includes(tag.name) && ' ✓'}
                    </button>
                  ))}
                </div>
                {/* Create new tag inline */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Create new tag..."
                      className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400 focus:outline-none focus:border-sky-500"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createNewTag(newTagName); } }}
                    />
                    <button
                      type="button"
                      onClick={() => createNewTag(newTagName)}
                      disabled={!newTagName.trim() || creatingTag}
                      className="px-3 py-1.5 text-slate-900 dark:text-slate-100 rounded-lg text-sm hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: newTagColor }}
                    >
                      {creatingTag ? '...' : '+'}
                    </button>
                  </div>
                  {/* Color picker */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Color:</span>
                    {tagColors.map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => setNewTagColor(c.color)}
                        className={`w-5 h-5 rounded-full transition-all ${
                          newTagColor === c.color ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0e1623] scale-110' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c.color }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
                {selectedTags.length > 0 && (
                  <p className="text-xs text-sky-600 mt-2">
                    {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                After creating your campaign, you can add leads to it from the Leads page by selecting leads and running a campaign.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setCreateOpen(false); setNewCampaignName(''); setSelectedFlowId(''); setSelectedTags([]); }}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={createCampaign}
                  disabled={creating || !newCampaignName.trim()}
                  className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Campaign Modal */}
      {editOpen && editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Edit Campaign</h2>
              <button
                onClick={() => { setEditOpen(false); setEditingCampaign(null); }}
                className="text-slate-600 dark:text-slate-400 hover:text-gray-900"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Campaign Name</label>
                <input
                  type="text"
                  value={editCampaignName}
                  onChange={(e) => setEditCampaignName(e.target.value)}
                  placeholder="Enter campaign name..."
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400 focus:outline-none focus:border-sky-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && !saving) saveEditCampaign(); }}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">AI Flow</label>
                {flows.length > 0 ? (
                  <select
                    value={editFlowId}
                    onChange={(e) => setEditFlowId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">No flow selected</option>
                    {flows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">No flows created yet</span>
                    <Link
                      href="/templates"
                      className="text-sm text-sky-600 hover:underline"
                    >
                      Create a flow
                    </Link>
                  </div>
                )}
              </div>

              {/* Tags Selection for Edit */}
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.name, true)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        editTags.includes(tag.name)
                          ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-[#0e1623]'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: tag.color + '30', color: tag.color, borderColor: tag.color }}
                    >
                      {tag.name}
                      {editTags.includes(tag.name) && ' ✓'}
                    </button>
                  ))}
                </div>
                {editTags.length > 0 && (
                  <p className="text-xs text-sky-600 mt-1">
                    {editTags.length} tag{editTags.length > 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setEditOpen(false); setEditingCampaign(null); setEditTags([]); }}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditCampaign}
                  disabled={saving || !editCampaignName.trim()}
                  className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
