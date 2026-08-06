'use client';

// API key management for the browser extension. (#148)
//
// The key is returned by POST once and never again — nothing can read it back,
// because only its hash is stored. So the newly minted value is held in state
// and shown until dismissed, with copy-to-clipboard, and the UI says plainly
// that it will not be shown twice.

import { useEffect, useState } from 'react';
import { Key, Copy, Check, Trash2, Plus, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('Browser extension');
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/settings/api-keys');
      const data = await res.json();
      if (data.ok) setKeys(data.keys);
    } catch {
      toast.error('Could not load API keys');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createKey() {
    setCreating(true);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || 'Could not create the key');
        return;
      }
      // The only moment this value exists outside the user's clipboard.
      setFreshKey(data.key);
      setCopied(false);
      await load();
    } catch {
      toast.error('Could not create the key');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Anything using it stops working immediately.`)) return;
    try {
      const res = await fetch(`/api/settings/api-keys?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error || 'Could not revoke the key');
        return;
      }
      toast.success('Key revoked');
      await load();
    } catch {
      toast.error('Could not revoke the key');
    }
  }

  const active = keys.filter(k => !k.revoked_at);
  const revoked = keys.filter(k => k.revoked_at);

  return (
    <div className="card border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-sky-100 dark:bg-sky-900/40 rounded-lg">
          <Key className="w-4 h-4 text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-sky-600 dark:text-sky-400">API Keys</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            For the browser extension. Paste one into the extension&apos;s settings to connect it
            to this account.
          </p>
        </div>
      </div>

      {freshKey && (
        <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <strong>Copy this now — it will not be shown again.</strong> Only a fingerprint of
              it is stored, so nobody, including us, can recover it later. Lost it? Revoke it and
              make another.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 text-xs font-mono text-slate-900 dark:text-slate-100 break-all">
              {freshKey}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(freshKey);
                  setCopied(true);
                  toast.success('Copied');
                } catch {
                  toast.error('Could not copy — select it and copy manually');
                }
              }}
              className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white text-sm inline-flex items-center gap-1.5 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFreshKey(null)}
            className="mt-3 text-xs text-amber-700 dark:text-amber-400 hover:underline"
          >
            I&apos;ve saved it — hide this
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="What is this key for?"
          maxLength={60}
          className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={createKey}
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating…' : 'New key'}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

        {!loading && active.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No active keys. Create one to connect the extension.
          </p>
        )}

        {active.map(k => (
          <div
            key={k.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{k.name}</p>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                {k.key_prefix}…
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Created {new Date(k.created_at).toLocaleDateString()}
                {' · '}
                {k.last_used_at
                  ? `last used ${new Date(k.last_used_at).toLocaleString()}`
                  : 'never used'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => revoke(k.id, k.name)}
              className="px-3 py-1.5 rounded text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 inline-flex items-center gap-1.5 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Revoke
            </button>
          </div>
        ))}

        {revoked.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
              {revoked.length} revoked {revoked.length === 1 ? 'key' : 'keys'}
            </summary>
            <div className="mt-2 space-y-1">
              {revoked.map(k => (
                <p key={k.id} className="text-xs text-slate-400 dark:text-slate-500">
                  <span className="font-mono">{k.key_prefix}…</span> {k.name} — revoked{' '}
                  {new Date(k.revoked_at!).toLocaleDateString()}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
