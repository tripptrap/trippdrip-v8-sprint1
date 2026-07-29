'use client';

// Operator UI for the platform-wide DNC list (#94).
//
// Backed by /api/admin/dnc-global (#88). Two things drive the design here:
//
//   1. An entry blocks the number for EVERY tenant, not one account. That is
//      not obvious from a list of phone numbers, so it is stated on the panel
//      rather than left to be inferred.
//   2. Removing an entry UN-BLOCKS someone who opted out. That is the only
//      action here that can create a compliance problem rather than prevent
//      one, so it gets a confirmation that names the consequence — not a bare
//      trash icon.

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldBan, Loader2, Plus, Trash2, AlertTriangle, RefreshCw, UserX } from 'lucide-react';

type GlobalDncEntry = {
  id: string;
  phone_number: string;
  normalized_phone: string;
  reason: string | null;
  source: string | null;
  notes: string | null;
  complaint_count: number | null;
  created_at: string;
};

export default function GlobalDncManager() {
  const [entries, setEntries] = useState<GlobalDncEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const [confirmRemove, setConfirmRemove] = useState<GlobalDncEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/dnc-global', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setLoadError(json.error || `Request failed (${res.status})`);
      } else {
        setLoadError(null);
        setEntries(json.entries ?? []);
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load the global DNC list');
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!phone.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/dnc-global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone.trim(), reason: reason.trim() || null, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not add the number');
      } else if (json.already_present) {
        toast(`${json.normalized_phone} was already on the global list`, { icon: 'ℹ️' });
      } else {
        toast.success(`${json.normalized_phone} is now blocked for all tenants`);
      }
      if (res.ok) { setPhone(''); setReason(''); setNotes(''); await load(); }
    } catch (e: any) {
      toast.error(e?.message || 'Could not add the number');
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/admin/dnc-global', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: confirmRemove.phone_number }),
      });
      const json = await res.json();
      if (!res.ok) toast.error(json.error || 'Could not remove the number');
      else {
        toast.success(`${confirmRemove.phone_number} removed — it can be messaged again`);
        setConfirmRemove(null);
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove the number');
    } finally {
      setRemoving(false);
    }
  };

  const promotedCount = entries.filter((e) => e.source === 'account_deleted').length;

  return (
    <div className="card">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldBan className="w-5 h-5" /> Global do-not-contact list
            </h3>
            {/* Stated, not implied — a list of phone numbers gives no hint of scope. */}
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Numbers here are blocked for <strong>every tenant on the platform</strong>, not one
              account. Use it for people who must never be contacted — litigators, repeat
              complainants, imported registries. Per-account opt-outs live on each user&apos;s own
              DNC list instead.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Add */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white sm:w-48"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. litigator)"
            className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white flex-1"
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white flex-1"
          />
          <button
            onClick={add}
            disabled={adding || !phone.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 whitespace-nowrap"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Block everywhere
          </button>
        </div>
      </div>

      {/* List */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : loadError ? (
          <div className="flex items-start gap-2 text-sm rounded-lg p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {loadError}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nothing on the global list. Entries appear here when an operator adds one, or when a
            deleted account&apos;s opt-outs are carried over so they keep being enforced.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Number</th>
                  <th className="text-left font-medium px-3 py-2">Reason</th>
                  <th className="text-left font-medium px-3 py-2">Origin</th>
                  <th className="text-left font-medium px-3 py-2">Added</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-2 font-mono text-slate-900 dark:text-white whitespace-nowrap">
                      {e.phone_number}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {e.reason || '—'}
                      {e.notes && (
                        <span className="block text-xs text-slate-400 dark:text-slate-500">{e.notes}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {/* Worth distinguishing: entries carried over from a deleted
                          account are the ones an operator is most likely to review. */}
                      {e.source === 'account_deleted' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          <UserX className="w-3 h-3" /> deleted account
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {e.source || 'admin'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setConfirmRemove(e)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length > 0 && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            {entries.length} number{entries.length === 1 ? '' : 's'} blocked platform-wide
            {promotedCount > 0 && ` · ${promotedCount} carried over from deleted account${promotedCount === 1 ? '' : 's'}`}
          </p>
        )}
      </div>

      {/* Removal confirmation — this is the action that can cause harm, so it
          names the consequence instead of asking "are you sure?". */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                Allow messaging to this number again?
              </h4>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-mono text-slate-900 dark:text-white">{confirmRemove.phone_number}</span>{' '}
              is on the do-not-contact list
              {confirmRemove.reason ? ` — “${confirmRemove.reason}”` : ''}. Removing it lets every
              tenant message this number again.
            </p>
            {confirmRemove.source === 'account_deleted' && (
              <p className="mt-3 text-sm rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-300">
                This entry came from a deleted account, which means someone opted out of messages
                from this platform. Removing it discards that opt-out.
              </p>
            )}
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setConfirmRemove(null)}
                disabled={removing}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Keep it blocked
              </button>
              <button
                onClick={remove}
                disabled={removing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {removing && <Loader2 className="w-4 h-4 animate-spin" />}
                Remove and allow messaging
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
