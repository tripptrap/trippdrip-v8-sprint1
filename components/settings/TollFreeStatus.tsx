'use client';

// Live toll-free verification status (#43).
//
// Before this, nothing in the app displayed TFV state at all — the verified set
// was fetched only to gate behaviour, never shown. Answering "are our numbers
// verified?" meant logging into the Telnyx portal, and on 2026-07-28 a bad
// ad-hoc script answered it wrongly with nothing in-app to contradict it.
//
// The single most important rule in this file: an unreachable Telnyx must never
// render as "not verified". That conflation is the whole bug. `verified` is
// null (not false) when the read failed, and the unreachable banner replaces the
// per-number verdicts rather than sitting alongside them.

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck, Loader2, RefreshCw, AlertTriangle, CircleSlash, HelpCircle } from 'lucide-react';

type TollFreeNumber = {
  phoneNumber: string;
  friendlyName: string | null;
  status: string | null;
  isPrimary: boolean | null;
  verified: boolean | null;
};

type PoolNumber = {
  phoneNumber: string;
  isAssigned: boolean | null;
  storedVerified: boolean | null;
  liveVerified: boolean | null;
};

type VerificationRequest = {
  id: string;
  verificationStatus: string;
  reason: string | null;
  businessName: string | null;
  phoneNumbers: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

type StatusResponse = {
  ok: boolean;
  telnyxReachable: boolean;
  telnyxError: string | null;
  checkedAt: string;
  numbers: TollFreeNumber[];
  isAdmin: boolean;
  poolNumbers?: PoolNumber[];
  requests?: VerificationRequest[];
};

function verdictPill(verified: boolean | null) {
  if (verified === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        <HelpCircle className="w-3 h-3" /> Unknown
      </span>
    );
  }
  return verified ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
      <BadgeCheck className="w-3 h-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <CircleSlash className="w-3 h-3" /> Not verified
    </span>
  );
}

function requestPill(status: string) {
  const s = status.toLowerCase();
  const cls = s === 'verified'
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    : s === 'rejected'
    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TollFreeStatus() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/telnyx/tollfree-status', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setLoadError(json.error || `Request failed (${res.status})`);
        setData(null);
      } else {
        setLoadError(null);
        setData(json);
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load verification status');
      setData(null);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    await load(true);
    toast.success('Verification status refreshed');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking toll-free verification…
      </div>
    );
  }

  const unreachable = data ? !data.telnyxReachable : false;

  return (
    <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <BadgeCheck className="w-4 h-4" /> Toll-free verification
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Toll-free numbers must be verified by the carriers before they can send. This reads
            live from Telnyx.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <div className="mt-4 flex items-start gap-2 text-sm rounded-lg p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Unreachable is its own state, not a verdict. Saying "not verified"
          here would repeat the exact mistake this panel exists to prevent. */}
      {unreachable && (
        <div className="mt-4 flex items-start gap-2 text-sm rounded-lg p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Couldn&apos;t reach Telnyx, so verification status is unknown — this does <strong>not</strong> mean
            the numbers are unverified.
            {data?.telnyxError ? ` (${data.telnyxError})` : ''} Try Refresh in a moment.
          </span>
        </div>
      )}

      {data && (
        <>
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Last checked {new Date(data.checkedAt).toLocaleString()}
          </p>

          <div className="mt-4">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Your toll-free numbers</h4>
            {data.numbers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You don&apos;t have any toll-free numbers. Local numbers don&apos;t need toll-free
                verification — they go through 10DLC registration above.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700">
                {data.numbers.map((n) => (
                  <li key={n.phoneNumber} className="flex items-center justify-between gap-3 px-3 py-2.5 flex-wrap">
                    <div className="min-w-0">
                      <span className="font-mono text-sm text-slate-900 dark:text-white">{n.phoneNumber}</span>
                      {n.isPrimary && (
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">primary</span>
                      )}
                      {n.friendlyName && (
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 truncate">{n.friendlyName}</span>
                      )}
                    </div>
                    {verdictPill(n.verified)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.isAdmin && data.poolNumbers && data.poolNumbers.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Shared pool <span className="font-normal text-slate-400 dark:text-slate-500">(admin)</span>
              </h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Number</th>
                      <th className="text-left font-medium px-3 py-2">Stored</th>
                      <th className="text-left font-medium px-3 py-2">Live (Telnyx)</th>
                      <th className="text-left font-medium px-3 py-2">Assigned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {data.poolNumbers.map((n) => {
                      // Drift between what the DB believes and what Telnyx says
                      // is the thing #36 reconciles — surface it rather than
                      // quietly showing one of the two.
                      const drift = n.liveVerified !== null && n.storedVerified !== n.liveVerified;
                      return (
                        <tr key={n.phoneNumber} className={drift ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
                          <td className="px-3 py-2 font-mono text-slate-900 dark:text-white whitespace-nowrap">{n.phoneNumber}</td>
                          <td className="px-3 py-2">{n.storedVerified ? 'verified' : 'not verified'}</td>
                          <td className="px-3 py-2">{verdictPill(n.liveVerified)}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{n.isAssigned ? 'yes' : 'no'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {data.poolNumbers.some((n) => n.liveVerified !== null && n.storedVerified !== n.liveVerified) && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  Highlighted rows disagree between the database and Telnyx.
                </p>
              )}
            </div>
          )}

          {data.isAdmin && data.requests && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Verification requests <span className="font-normal text-slate-400 dark:text-slate-500">(admin)</span>
              </h4>
              {data.requests.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Telnyx reports no verification requests on this account.
                </p>
              ) : (
                <ul className="space-y-2">
                  {/* Rejected and expired requests are kept on purpose — that
                      history is what makes "was it ever submitted?" answerable. */}
                  {data.requests.map((r) => (
                    <li key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          {requestPill(r.verificationStatus)}
                          <span className="text-sm text-slate-700 dark:text-slate-300">{r.businessName || '—'}</span>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          submitted {formatDate(r.createdAt)} · updated {formatDate(r.updatedAt)}
                        </span>
                      </div>
                      {r.reason && (
                        <p className="mt-2 text-sm text-red-700 dark:text-red-400">{r.reason}</p>
                      )}
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono break-all">
                        {r.phoneNumbers.join(', ') || 'no numbers'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 font-mono break-all">{r.id}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
