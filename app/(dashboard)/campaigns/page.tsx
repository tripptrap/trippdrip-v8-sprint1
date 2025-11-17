'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CustomModal from "@/components/CustomModal";

type Campaign = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tags_applied: string[];
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  useEffect(() => {
    loadCampaigns();
  }, []);

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
          tags_applied: campaign.type === 'drip' ? ['Health Insurance'] : ['Auto Insurance'],
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
          setCampaigns(data.items || []);
        }
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
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
    campaign.tags_applied.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
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
          <h1 className="text-2xl font-semibold text-[#e7eef9]">Campaigns</h1>
          <p className="text-[#9fb0c3] mt-1">View and manage your SMS campaigns</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/campaigns/schedule"
            className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule Campaign
          </Link>
          <Link
            href="/templates"
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            Create New Campaign
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search campaigns by name or tag..."
          className="w-full px-4 py-2 bg-[#0c1420] border border-[#223246] rounded-lg text-[#e7eef9] placeholder:text-[#5a6b7f]"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Total Campaigns</div>
          <div className="text-3xl font-bold text-[#e7eef9]">{campaigns.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Total Leads</div>
          <div className="text-3xl font-bold text-[#e7eef9]">
            {campaigns.reduce((sum, c) => sum + (c.lead_count || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Messages Sent</div>
          <div className="text-3xl font-bold text-[#e7eef9]">
            {campaigns.reduce((sum, c) => sum + (c.messages_sent || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Credits Used</div>
          <div className="text-3xl font-bold text-blue-400">
            {campaigns.reduce((sum, c) => sum + (c.credits_used || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Active Tags</div>
          <div className="text-3xl font-bold text-[#e7eef9]">
            {new Set(campaigns.flatMap(c => c.tags_applied || [])).size}
          </div>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-[#9fb0c3]">Loading campaigns...</div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-[#9fb0c3] mb-4">
              {searchQuery ? 'No campaigns found matching your search.' : 'No campaigns yet.'}
            </div>
            {!searchQuery && (
              <Link
                href="/templates"
                className="inline-block bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
              >
                Create Your First Campaign
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0c1420] border-b border-[#223246]">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#9fb0c3]">Campaign Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#9fb0c3]">Tags Applied</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-[#9fb0c3]">Leads</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-[#9fb0c3]">Messages Sent</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-[#9fb0c3]">Credits Used</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#9fb0c3]">Created</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#9fb0c3]">Last Updated</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-[#9fb0c3]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#223246]">
                {filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-[#0c1420]/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#e7eef9]">{campaign.name}</div>
                      <div className="text-xs text-[#5a6b7f]">{campaign.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {campaign.tags_applied && campaign.tags_applied.length > 0 ? (
                          campaign.tags_applied.map((tag) => (
                            <span
                              key={tag}
                              className="inline-block px-2 py-1 text-xs bg-blue-900/30 text-blue-300 border border-blue-700 rounded"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-[#5a6b7f] text-sm">No tags</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium text-[#e7eef9]">{campaign.lead_count || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium text-[#e7eef9]">{campaign.messages_sent || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium text-blue-400">{campaign.credits_used || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#9fb0c3]">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#9fb0c3]">
                      {new Date(campaign.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => deleteCampaign(campaign.id, campaign.name)}
                        className="text-red-400 hover:text-red-300 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help */}
      <div className="card bg-blue-900/20 border-blue-700/50">
        <h3 className="font-semibold mb-2 text-[#e7eef9]">💡 Campaign Tips</h3>
        <ul className="text-sm text-[#9fb0c3] space-y-1">
          <li>• Tag your leads to organize them into campaigns</li>
          <li>• Track messages sent and lead engagement</li>
          <li>• Use the <Link href="/leads" className="text-blue-400 hover:underline">Leads</Link> page to filter by campaign tags</li>
          <li>• Create automated messaging workflows in <Link href="/templates" className="text-blue-400 hover:underline">Templates</Link></li>
        </ul>
      </div>
    </div>
  );
}
