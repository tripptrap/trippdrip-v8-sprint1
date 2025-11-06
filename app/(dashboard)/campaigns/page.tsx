'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    setLoading(true);
    try {
      const response = await fetch('/api/campaigns');
      const data = await response.json();
      if (data.ok) {
        setCampaigns(data.items || []);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCampaign(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete campaign "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/campaigns/delete?id=${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.ok) {
        await loadCampaigns();
      } else {
        alert(`Error: ${data.error || 'Failed to delete campaign'}`);
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Failed to delete campaign');
    }
  }

  const filteredCampaigns = campaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    campaign.tags_applied.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-gray-600 mt-1">View and manage your SMS campaigns</p>
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
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Total Campaigns</div>
          <div className="text-3xl font-bold">{campaigns.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Total Leads</div>
          <div className="text-3xl font-bold">
            {campaigns.reduce((sum, c) => sum + (c.lead_count || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Messages Sent</div>
          <div className="text-3xl font-bold">
            {campaigns.reduce((sum, c) => sum + (c.messages_sent || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Credits Used</div>
          <div className="text-3xl font-bold text-blue-600">
            {campaigns.reduce((sum, c) => sum + (c.credits_used || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Active Tags</div>
          <div className="text-3xl font-bold">
            {new Set(campaigns.flatMap(c => c.tags_applied || [])).size}
          </div>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading campaigns...</div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-600 mb-4">
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
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Campaign Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Tags Applied</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">Leads</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">Messages Sent</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">Credits Used</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Created</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Last Updated</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{campaign.name}</div>
                      <div className="text-xs text-gray-500">{campaign.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {campaign.tags_applied && campaign.tags_applied.length > 0 ? (
                          campaign.tags_applied.map((tag) => (
                            <span
                              key={tag}
                              className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-sm">No tags</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium">{campaign.lead_count || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium">{campaign.messages_sent || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-medium text-blue-600">{campaign.credits_used || 0}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(campaign.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => deleteCampaign(campaign.id, campaign.name)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
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
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold mb-2">💡 Campaign Tips</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• Tag your leads to organize them into campaigns</li>
          <li>• Track messages sent and lead engagement</li>
          <li>• Use the <Link href="/leads" className="text-blue-600 hover:underline">Leads</Link> page to filter by campaign tags</li>
          <li>• Create automated messaging workflows in <Link href="/templates" className="text-blue-600 hover:underline">Templates</Link></li>
        </ul>
      </div>
    </div>
  );
}
