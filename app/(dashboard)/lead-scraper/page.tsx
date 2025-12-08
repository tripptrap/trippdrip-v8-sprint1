'use client';

import { useState, useEffect } from 'react';
import { Globe, Play, Download, Loader2, Check, AlertCircle, Zap, Edit2, Save, X } from 'lucide-react';
import { SCRAPER_TEMPLATES } from '@/lib/scraper';

export default function LeadScraperPage() {
  const [scrapers, setScrapers] = useState<any[]>([]);
  const [scrapedData, setScrapedData] = useState<any[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingScraperId, setEditingScraperId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');

  useEffect(() => {
    loadScrapers();
    loadScrapedData();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadScrapers = async () => {
    try {
      const response = await fetch('/api/scraper/configs?templates=true');
      const data = await response.json();

      if (data.success) {
        setScrapers(data.scrapers || []);
      }
    } catch (error) {
      console.error('Error loading scrapers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScrapedData = async () => {
    try {
      const response = await fetch('/api/scraper/convert-to-leads');
      const data = await response.json();

      if (data.success) {
        setScrapedData(data.records || []);
      }
    } catch (error) {
      console.error('Error loading scraped data:', error);
    }
  };

  const createFromTemplate = async (templateKey: string) => {
    try {
      const template = SCRAPER_TEMPLATES[templateKey as keyof typeof SCRAPER_TEMPLATES];

      const response = await fetch('/api/scraper/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          start_url: 'https://example.com', // User will update this
          extraction_rules: {
            fields: template.fields,
            pagination: null,
          },
          status: 'draft',
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', `${template.name} scraper created! Update the URL to start scraping.`);
        loadScrapers();
      } else {
        showMessage('error', data.error || 'Failed to create scraper');
      }
    } catch (error) {
      console.error('Error creating scraper:', error);
      showMessage('error', 'Failed to create scraper from template');
    }
  };

  const startEdit = (scraper: any) => {
    setEditingScraperId(scraper.id);
    setEditUrl(scraper.start_url);
  };

  const cancelEdit = () => {
    setEditingScraperId(null);
    setEditUrl('');
  };

  const saveUrl = async (scraperId: string) => {
    try {
      const response = await fetch('/api/scraper/configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scraperId,
          start_url: editUrl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', 'URL updated successfully!');
        setEditingScraperId(null);
        setEditUrl('');
        loadScrapers();
      } else {
        showMessage('error', data.error || 'Failed to update URL');
      }
    } catch (error) {
      console.error('Error updating URL:', error);
      showMessage('error', 'Failed to update URL');
    }
  };

  const runScraper = async (scraperId: string) => {
    setRunning(scraperId);

    try {
      const response = await fetch('/api/scraper/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scraperId, maxPages: 5 }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', `Scraper started! Spent ${data.pointsSpent} points. ${data.pointsRemaining} points remaining.`);

        // Poll for results
        setTimeout(() => {
          loadScrapedData();
        }, 5000);
      } else {
        if (data.needsPoints) {
          showMessage('error', `${data.error} Buy more points to continue scraping.`);
        } else {
          showMessage('error', data.error || 'Failed to start scraper');
        }
      }
    } catch (error) {
      console.error('Error running scraper:', error);
      showMessage('error', 'Failed to run scraper');
    } finally {
      setRunning(null);
    }
  };

  const convertToLeads = async () => {
    if (selectedRecords.length === 0) {
      showMessage('error', 'Please select records to convert');
      return;
    }

    setConverting(true);

    try {
      const response = await fetch('/api/scraper/convert-to-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrapedDataIds: selectedRecords }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', data.message);
        setSelectedRecords([]);
        loadScrapedData();
      } else {
        showMessage('error', data.error || 'Failed to convert records');
      }
    } catch (error) {
      console.error('Error converting to leads:', error);
      showMessage('error', 'Failed to convert to leads');
    } finally {
      setConverting(false);
    }
  };

  const toggleRecord = (id: string) => {
    setSelectedRecords(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedRecords.length === scrapedData.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(scrapedData.map(r => r.id));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-lg">
                <Globe className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white">Lead Scraper</h1>
              <span className="px-3 py-1 bg-emerald-400/20 border border-emerald-400/30 rounded-full text-emerald-400 text-xs font-bold uppercase">
                Beta
              </span>
            </div>
            <p className="text-white/60">
              Extract leads from websites automatically - similar to Octoparse
            </p>
            <div className="mt-2 p-3 bg-yellow-600/10 border border-yellow-500/30 rounded-lg">
              <p className="text-xs text-yellow-300">
                <strong>Beta:</strong> Works best with simple business listing sites. For enterprise scraping (LinkedIn, Facebook, etc.), upgrade to ScraperAPI integration.
              </p>
            </div>
          </div>
          <div className="px-6 py-4 bg-emerald-600/20 border border-emerald-500/30 rounded-lg text-center">
            <div className="text-sm text-blue-300 mb-1">Cost per scrape</div>
            <div className="text-3xl font-bold text-white">50 <span className="text-lg text-white/60">points</span></div>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <Check className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Pre-built Templates */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-white mb-4">Quick Start Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(SCRAPER_TEMPLATES).map(([key, template]) => {
            const isComingSoon = (template as any).comingSoon;
            return (
              <div key={key} className={`p-4 bg-white/5 border rounded-lg transition-colors relative ${
                isComingSoon
                  ? 'border-yellow-500/30 opacity-60'
                  : 'border-white/10 hover:bg-white/10'
              }`}>
                {isComingSoon && (
                  <span className="absolute top-2 right-2 px-2 py-1 bg-yellow-600/80 text-yellow-100 text-xs font-bold rounded uppercase">
                    Coming Soon
                  </span>
                )}
                <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                <p className="text-sm text-white/60 mb-3">{template.description}</p>
                <button
                  onClick={() => !isComingSoon && createFromTemplate(key)}
                  disabled={isComingSoon}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isComingSoon
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isComingSoon ? 'Coming Soon' : 'Use Template'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* My Scrapers */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-white mb-4">My Scrapers</h2>
        {scrapers.filter(s => !s.is_template).length === 0 ? (
          <div className="p-8 bg-white/5 border border-white/10 rounded-lg text-center">
            <Globe className="h-12 w-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/60">No scrapers yet. Create one from a template above!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scrapers.filter(s => !s.is_template).map(scraper => (
              <div key={scraper.id} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                {editingScraperId === scraper.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-white/60 mb-2">Target URL</label>
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveUrl(scraper.id)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                      >
                        <Save className="h-4 w-4" />
                        Save URL
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg flex items-center gap-2 transition-colors"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{scraper.name}</h3>
                      <p className="text-sm text-white/60">{scraper.start_url}</p>
                      <p className="text-xs text-white/40 mt-1">
                        {scraper.total_records_scraped} leads scraped · {scraper.total_runs} runs
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(scraper)}
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg flex items-center gap-2 transition-colors"
                        title="Edit URL"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => runScraper(scraper.id)}
                        disabled={running === scraper.id}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                      >
                        {running === scraper.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Run Now
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scraped Data */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Scraped Leads ({scrapedData.length})</h2>
          {selectedRecords.length > 0 && (
            <button
              onClick={convertToLeads}
              disabled={converting}
              className="px-4 py-2 bg-emerald-400 hover:bg-emerald-500 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              {converting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Convert {selectedRecords.length} to Leads
                </>
              )}
            </button>
          )}
        </div>

        {scrapedData.length === 0 ? (
          <div className="p-8 bg-white/5 border border-white/10 rounded-lg text-center">
            <Download className="h-12 w-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/60">No scraped data yet. Run a scraper to get started!</p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedRecords.length === scrapedData.length}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/80">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/80">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/80">Phone</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/80">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/80">Source</th>
                </tr>
              </thead>
              <tbody>
                {scrapedData.map(record => {
                  const data = record.data;
                  return (
                    <tr key={record.id} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedRecords.includes(record.id)}
                          onChange={() => toggleRecord(record.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-white">
                        {data.name || data.businessName || data.fullName || '-'}
                      </td>
                      <td className="px-4 py-3 text-white/80 text-sm">
                        {data.email || '-'}
                      </td>
                      <td className="px-4 py-3 text-white/80 text-sm">
                        {data.phone || data.phoneNumber || '-'}
                      </td>
                      <td className="px-4 py-3 text-white/80 text-sm">
                        {data.company || data.businessName || data.companyName || '-'}
                      </td>
                      <td className="px-4 py-3 text-white/60 text-xs">
                        {new URL(record.source_url).hostname}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
