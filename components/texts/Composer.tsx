"use client";

import { useState, useRef, useMemo, useEffect } from 'react';
import { Send, Paperclip, Clock, X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { calculateSMSCredits, getCharacterWarning } from '@/lib/creditCalculator';
import ScheduleMessagePopover from './ScheduleMessagePopover';
import type { Thread } from '@/lib/hooks/useTextsState';
import toast from 'react-hot-toast';

interface ComposerProps {
  thread: Thread;
  optOutKeyword: string;
  isFirstMessage: boolean;
  channel: 'sms' | 'whatsapp';
  onSend: (body: string, options?: { mediaUrls?: string[]; scheduledFor?: string }) => Promise<void>;
  disabled?: boolean;
}

export default function Composer({
  thread,
  optOutKeyword,
  isFirstMessage,
  channel,
  onSend,
  disabled,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDncBlocked, setIsDncBlocked] = useState(false);
  const [checkingDnc, setCheckingDnc] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mediaCount = attachedFiles.length;
  const creditCalc = useMemo(() => calculateSMSCredits(text, mediaCount), [text, mediaCount]);
  const charWarning = useMemo(() => getCharacterWarning(text.length), [text.length]);

  // Check DNC status when thread changes
  useEffect(() => {
    const phone = thread.phone_number;
    if (!phone) return;

    setCheckingDnc(true);
    fetch('/api/dnc/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    })
      .then(res => res.json())
      .then(data => {
        setIsDncBlocked(data.on_dnc_list === true);
      })
      .catch(() => setIsDncBlocked(false))
      .finally(() => setCheckingDnc(false));
  }, [thread.phone_number]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [text]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const valid = files.filter(f => {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} is not an image`);
        return false;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 5MB limit`);
        return false;
      }
      return true;
    });

    setAttachedFiles(prev => [...prev, ...valid]);
    valid.forEach(f => {
      setPreviewUrls(prev => [...prev, URL.createObjectURL(f)]);
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(index: number) {
    URL.revokeObjectURL(previewUrls[index]);
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  }

  async function uploadMedia(): Promise<string[]> {
    if (attachedFiles.length === 0) return [];

    setUploading(true);
    const urls: string[] = [];

    for (const file of attachedFiles) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.url) {
          urls.push(data.url);
        } else {
          toast.error(`Failed to upload ${file.name}`);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    return urls;
  }

  async function handleSend() {
    if ((!text.trim() && attachedFiles.length === 0) || sending || disabled || isDncBlocked) return;

    setSending(true);
    try {
      let mediaUrls: string[] | undefined;
      if (attachedFiles.length > 0) {
        mediaUrls = await uploadMedia();
        if (mediaUrls.length === 0 && attachedFiles.length > 0) {
          toast.error('Media upload failed');
          setSending(false);
          return;
        }
      }

      await onSend(text.trim(), { mediaUrls });

      // Reset
      setText('');
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setAttachedFiles([]);
      setPreviewUrls([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule(scheduledFor: string) {
    if (!text.trim() || sending || disabled || isDncBlocked) return;

    setSending(true);
    try {
      await onSend(text.trim(), { scheduledFor });
      setText('');
      setShowSchedule(false);
      toast.success(`Message scheduled for ${new Date(scheduledFor).toLocaleString()}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule message');
    } finally {
      setSending(false);
    }
  }

  if (isDncBlocked) {
    return (
      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-red-50 dark:bg-red-900/10">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">This contact is on the Do Not Call list. Messaging is permanently blocked.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 shrink-0">
      {/* First message notice */}
      {isFirstMessage && text.trim() && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 px-2 py-1.5 rounded">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>First message &mdash; opt-out footer will be appended: &quot;Reply {optOutKeyword} to opt out&quot;</span>
          </div>
        </div>
      )}

      {/* Media previews */}
      {previewUrls.length > 0 && (
        <div className="px-3 pt-2 flex gap-2 flex-wrap">
          {previewUrls.map((url, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Credit display */}
      {(text.length > 0 || mediaCount > 0) && (
        <div className="px-3 pt-2 flex items-center justify-between text-xs">
          <span className={`font-medium ${creditCalc.credits > 1 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
            {creditCalc.breakdown}
          </span>
          {text.length > 0 && charWarning.remaining > 0 && charWarning.remaining <= 20 && (
            <span className="text-amber-500">
              {charWarning.remaining} chars to next segment
            </span>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="p-3 flex items-end gap-2">
        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || uploading}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          title="Attach image"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Textarea */}
        <div className="flex-1 relative">
          {showSchedule && (
            <ScheduleMessagePopover
              onSchedule={handleSchedule}
              onCancel={() => setShowSchedule(false)}
            />
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && text.trim() && !showSchedule) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Type a message...`}
            disabled={sending || disabled}
            rows={1}
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 resize-none text-sm disabled:opacity-50"
          />
        </div>

        {/* Schedule button */}
        <button
          onClick={() => setShowSchedule(!showSchedule)}
          disabled={sending || !text.trim()}
          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
            showSchedule
              ? 'text-sky-600 bg-sky-50 dark:bg-sky-900/20'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
          title="Schedule message"
        >
          <Clock className="w-5 h-5" />
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={(!text.trim() && attachedFiles.length === 0) || sending || uploading}
          className="p-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          title={`Send ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
        >
          {sending || uploading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
