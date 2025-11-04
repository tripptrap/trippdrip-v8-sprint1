"use client";
import { useState } from "react";
import { getMessageStatusIcon, type MessageStatus } from "@/lib/storeOps";

type Message = {
  id: number;
  thread_id: number;
  direction: 'in' | 'out';
  sender: 'lead' | 'agent';
  body: string;
  created_at: string;
  status?: MessageStatus;
};

export default function ConversationDrawer({ open, onClose, leadName, messages, onSend, threadId }: {
  open: boolean;
  onClose: () => void;
  leadName: string;
  messages: Message[];
  onSend: (threadId: number, body: string) => void;
  threadId: number;
}) {
  const [text, setText] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-[var(--surface)]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="font-semibold">Conversation · {leadName}</div>
          <button onClick={onClose} className="text-[var(--muted)]">Close</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-120px)]">
          {messages.map(m => {
            const statusInfo = m.status ? getMessageStatusIcon(m.status) : null;
            return (
              <div key={m.id} className={`max-w-[80%] ${m.direction === 'out' ? 'ml-auto' : ''}`}>
                <div className={`px-3 py-2 rounded-xl ${m.direction === 'out' ? 'bg-blue-500 text-white' : 'bg-white/10'}`}>
                  <div className="text-xs opacity-60 mb-1">
                    {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div>{m.body}</div>
                  {m.direction === 'out' && statusInfo && (
                    <div className={`text-xs mt-1 flex items-center gap-1 justify-end ${statusInfo.color}`}>
                      <span>{statusInfo.icon}</span>
                      <span className="capitalize">{m.status}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-white/10 flex gap-2">
          <input
            className="flex-1 bg-transparent border border-white/10 rounded-xl px-3 py-2"
            placeholder="Type a message…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                onSend(threadId, text.trim());
                setText('');
              }
            }}
          />
          <button
            className="bg-[var(--accent)] text-black font-medium px-4 py-2 rounded-xl hover:opacity-90"
            onClick={() => {
              if (text.trim()) {
                onSend(threadId, text.trim());
                setText('');
              }
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
