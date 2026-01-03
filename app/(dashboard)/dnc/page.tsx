'use client';

import { useEffect, useState } from 'react';
import { Shield, Plus, Trash2, Upload, Download, Search, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

type DNCEntry = {
  id: string;
  phone_number: string;
  normalized_phone: string;
  reason: string;
  source: string | null;
  notes: string | null;
  created_at: string;
};

type DNCStats = {
  total_user_dnc: number;
  total_global_dnc: number;
  by_reason: Record<string, number>;
  recent_additions: DNCEntry[];
  checks_last_30_days: number;
  blocked_last_30_days: number;
};

export default function DNCPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DNCStats | null>(null);
  const [entries, setEntries] = useState<DNCEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  // Add single number form
  const [phoneNumber, setPhoneNumber] = useState('');
  const [reason, setReason] = useState('manual');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  // Bulk add form
  const [bulkNumbers, setBulkNumbers] = useState('');
  const [bulkReason, setBulkReason] = useState('manual');
  const [bulkAdding, setBulkAdding] = useState(false);

  useEffect(() => {
    loadDNCData();
  }, []);

  const loadDNCData = async () => {
    try {
      setLoading(true);

      // Get stats
      const statsRes = await fetch('/api/dnc/stats');
      const statsData = await statsRes.json();

      if (statsData.ok) {
        setStats(statsData.stats);
      }

      // Get list
      const listRes = await fetch('/api/dnc/list?limit=100');
      const listData = await listRes.json();

      if (listData.ok) {
        setEntries(listData.entries);
      }

    } catch (error: any) {
      console.error('Error loading DNC data:', error);
      toast.error('Failed to load DNC list');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNumber = async () => {
    if (!phoneNumber.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    try {
      setAdding(true);

      const response = await fetch('/api/dnc/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          reason,
          source: 'manual',
          notes: notes.trim() || null
        })
      });

      const data = await response.json();

      if (data.ok) {
        toast.success(`Phone number ${data.action === 'added' ? 'added' : 'updated'} successfully`);
        setPhoneNumber('');
        setNotes('');
        setShowAddDialog(false);
        loadDNCData();
      } else {
        toast.error(data.error || 'Failed to add phone number');
      }

    } catch (error: any) {
      console.error('Error adding to DNC:', error);
      toast.error('Failed to add phone number');
    } finally {
      setAdding(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!bulkNumbers.trim()) {
      toast.error('Please enter phone numbers');
      return;
    }

    const numbers = bulkNumbers
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (numbers.length === 0) {
      toast.error('No valid phone numbers found');
      return;
    }

    try {
      setBulkAdding(true);

      const response = await fetch('/api/dnc/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumbers: numbers,
          reason: bulkReason,
          source: 'bulk_import'
        })
      });

      const data = await response.json();

      if (data.ok) {
        toast.success(`${data.added} numbers added, ${data.updated} updated`);
        setBulkNumbers('');
        setShowBulkDialog(false);
        loadDNCData();
      } else {
        toast.error(data.error || 'Failed to add phone numbers');
      }

    } catch (error: any) {
      console.error('Error bulk adding to DNC:', error);
      toast.error('Failed to add phone numbers');
    } finally {
      setBulkAdding(false);
    }
  };

  const handleRemoveNumber = async (phoneNumber: string) => {
    if (!confirm(`Remove ${phoneNumber} from DNC list?`)) {
      return;
    }

    try {
      const response = await fetch('/api/dnc/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });

      const data = await response.json();

      if (data.ok) {
        toast.success('Number removed from DNC list');
        loadDNCData();
      } else {
        toast.error(data.error || 'Failed to remove number');
      }

    } catch (error: any) {
      console.error('Error removing from DNC:', error);
      toast.error('Failed to remove number');
    }
  };

  const handleExportCSV = () => {
    if (entries.length === 0) {
      toast.error('No entries to export');
      return;
    }

    const csv = [
      'Phone Number,Reason,Source,Notes,Added Date',
      ...entries.map(e => `${e.phone_number},${e.reason},${e.source || ''},${e.notes || ''},${new Date(e.created_at).toLocaleDateString()}`)
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnc-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('DNC list exported');
  };

  const filteredEntries = entries.filter(e =>
    e.phone_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.normalized_phone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600 dark:text-slate-400">Loading DNC list...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Do Not Call (DNC) List</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Manage compliance and respect opt-outs
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Your DNC List</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{stats?.total_user_dnc || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-red-100 dark:bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <Shield className="h-6 w-6 text-red-400" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Global DNC</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{stats?.total_global_dnc || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-sky-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Checks (30 days)</p>
              <p className="text-3xl font-bold text-sky-600">{stats?.checks_last_30_days || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <Search className="h-6 w-6 text-sky-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Blocked (30 days)</p>
              <p className="text-3xl font-bold text-sky-600">{stats?.blocked_last_30_days || 0}</p>
            </div>
            <div className="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-100 dark:bg-sky-800/50 flex items-center justify-between">
              <Shield className="h-6 w-6 text-sky-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-600 dark:text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search phone numbers..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Number
            </button>
            <button
              onClick={() => setShowBulkDialog(true)}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Bulk Add
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* DNC List Table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">DNC Entries ({filteredEntries.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Phone Number</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Reason</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Source</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Added</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-600 dark:text-slate-400">
                    {searchQuery ? 'No matching entries found' : 'No DNC entries yet'}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5 hover:bg-white">
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-900 dark:text-slate-100">{entry.phone_number}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">{entry.normalized_phone}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.reason === 'opt_out' ? 'bg-red-900/30 text-red-400' :
                        entry.reason === 'complaint' ? 'bg-orange-900/30 text-sky-600' :
                        entry.reason === 'legal' ? 'bg-sky-800/60 text-sky-600' :
                        'bg-blue-900/30 text-sky-600'
                      }`}>
                        {entry.reason}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{entry.source || '-'}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRemoveNumber(entry.phone_number)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Number Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2332] rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Add to DNC List</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Phone Number</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-4 py-2 bg-white border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="manual">Manual</option>
                  <option value="opt_out">Opt-Out</option>
                  <option value="complaint">Complaint</option>
                  <option value="legal">Legal Requirement</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes..."
                  rows={3}
                  className="w-full px-4 py-2 bg-white border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-white/20 text-slate-900 dark:text-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNumber}
                  disabled={adding}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-600/50 text-white rounded-lg transition-colors"
                >
                  {adding ? 'Adding...' : 'Add to DNC'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Dialog */}
      {showBulkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2332] rounded-lg max-w-2xl w-full p-6">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Bulk Add to DNC List</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                  Phone Numbers (one per line)
                </label>
                <textarea
                  value={bulkNumbers}
                  onChange={(e) => setBulkNumbers(e.target.value)}
                  placeholder={"+1 (555) 123-4567\n+1 (555) 987-6543\n..."}
                  rows={10}
                  className="w-full px-4 py-2 bg-white border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Reason</label>
                <select
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="manual">Manual</option>
                  <option value="opt_out">Opt-Out</option>
                  <option value="complaint">Complaint</option>
                  <option value="legal">Legal Requirement</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowBulkDialog(false)}
                  className="px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-white/20 text-slate-900 dark:text-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkAdd}
                  disabled={bulkAdding}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-500 disabled:bg-sky-500/50 text-white rounded-lg transition-colors"
                >
                  {bulkAdding ? 'Adding...' : 'Bulk Add to DNC'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
