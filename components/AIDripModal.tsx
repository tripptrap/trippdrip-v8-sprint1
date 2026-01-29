'use client';

import { useState, useEffect } from 'react';
import { X, Zap, Clock, MessageSquare, Calendar, Loader2, CheckCircle, StopCircle } from 'lucide-react';

interface AIDripModalProps {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
  phoneNumber: string;
  fromNumber?: string;
  onSuccess?: () => void;
}

interface DripStatus {
  id: string;
  status: string;
  intervalHours: number;
  maxMessages: number;
  messagesSent: number;
  startedAt: string;
  expiresAt: string;
  nextSendAt: string;
  timeUntilNext: string | null;
  lastError: string | null;
}

export default function AIDripModal({
  isOpen,
  onClose,
  threadId,
  phoneNumber,
  fromNumber,
  onSuccess,
}: AIDripModalProps) {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Drip configuration
  const [intervalHours, setIntervalHours] = useState(6);
  const [maxMessages, setMaxMessages] = useState(5);
  const [maxDurationHours, setMaxDurationHours] = useState(72);

  // Current drip status
  const [activeDrip, setActiveDrip] = useState<DripStatus | null>(null);

  // Check drip status when modal opens
  useEffect(() => {
    if (isOpen && threadId) {
      // Reset state when modal opens
      setError('');
      setSuccess('');
      setActiveDrip(null);
      checkDripStatus();
    }
  }, [isOpen, threadId]);

  const checkDripStatus = async () => {
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/ai-drip/status?threadId=${threadId}`);
      const data = await response.json();

      if (response.ok && data.success && data.active && data.drip) {
        setActiveDrip(data.drip);
      } else {
        setActiveDrip(null);
      }
    } catch (err) {
      console.error('Error checking drip status:', err);
      setActiveDrip(null);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleStartDrip = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/ai-drip/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          phoneNumber,
          fromNumber,
          intervalHours,
          maxMessages,
          maxDurationHours,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start drip');
      }

      setSuccess('AI Drip started! Follow-ups will be sent automatically.');
      setActiveDrip(data.drip);
      onSuccess?.();

    } catch (err: any) {
      setError(err.message || 'Failed to start drip');
    } finally {
      setLoading(false);
    }
  };

  const handleStopDrip = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/ai-drip/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to stop drip');
      }

      setSuccess('AI Drip stopped.');
      setActiveDrip(null);
      onSuccess?.();

      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Failed to stop drip');
    } finally {
      setLoading(false);
    }
  };

  // Reset error when modal is closed (component stays mounted)
  useEffect(() => {
    if (!isOpen) {
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">AI Drip</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Automatic follow-up messages</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {success}
            </div>
          )}

          {checkingStatus ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span className="ml-2 text-slate-400">Checking status...</span>
            </div>
          ) : activeDrip ? (
            /* Active Drip Status */
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                  <span className="text-amber-400 font-medium">Drip Active</span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Messages Sent</span>
                    <p className="text-white font-medium">
                      {activeDrip.messagesSent} / {activeDrip.maxMessages || '∞'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Interval</span>
                    <p className="text-white font-medium">{activeDrip.intervalHours} hours</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Next Message</span>
                    <p className="text-white font-medium">{activeDrip.timeUntilNext || 'Soon'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Status</span>
                    <p className="text-amber-400 font-medium capitalize">{activeDrip.status}</p>
                  </div>
                </div>

                {activeDrip.lastError && (
                  <div className="mt-3 text-xs text-red-400 bg-red-500/10 rounded p-2">
                    Last error: {activeDrip.lastError}
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-400 text-center">
                The drip will automatically stop when the client responds.
              </p>
            </div>
          ) : (
            /* Configure New Drip */
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                AI will automatically send follow-up messages until the client responds or the drip expires. v2
              </p>

              {/* Interval */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Send every
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 6, 12, 24].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => setIntervalHours(hours)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        intervalHours === hours
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Messages */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  Maximum messages
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[3, 5, 7, 0].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setMaxMessages(count)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        maxMessages === count
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {count === 0 ? '∞' : count}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Duration */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  Stop after
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[24, 48, 72, 168].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => setMaxDurationHours(hours)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        maxDurationHours === hours
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {hours < 48 ? `${hours}h` : hours === 168 ? '1 wk' : `${hours / 24}d`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-700/50 rounded-lg p-3 text-sm text-slate-300">
                <span className="text-amber-400 font-medium">Summary:</span> AI will send up to{' '}
                <span className="text-white font-medium">{maxMessages || 'unlimited'}</span> follow-ups,
                every <span className="text-white font-medium">{intervalHours} hours</span>,
                for up to <span className="text-white font-medium">
                  {maxDurationHours < 48 ? `${maxDurationHours} hours` : maxDurationHours === 168 ? '1 week' : `${maxDurationHours / 24} days`}
                </span>.
              </div>

              <p className="text-xs text-slate-500 text-center">
                Cost: 2 points per AI-generated message
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
            disabled={loading}
          >
            Cancel
          </button>

          {activeDrip ? (
            <button
              onClick={handleStopDrip}
              disabled={loading}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <StopCircle className="w-4 h-4" />
                  Stop Drip
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStartDrip}
              disabled={loading || checkingStatus}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Start Drip
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
