import { loadStore, saveStore } from "./localStore";

type Dir = "in" | "out";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

function nowISO(){ return new Date().toISOString(); }

export async function ensureStoreShape(){
  const s = await loadStore() || { leads:[], threads:[], messages:[] };
  s.leads     ||= [];
  s.threads   ||= [];
  s.messages  ||= [];
  await saveStore(s);
  return s;
}

export async function mergeLeadTags(lead_id:number, tags:string[]){
  const s = await ensureStoreShape();
  const L = s.leads.find((x:any)=> x.id===lead_id);
  if(!L) return;
  const set = new Set([...(L.tags||[]), ...(tags||[])].map(String));
  L.tags = Array.from(set);
  await saveStore(s);
}

export async function upsertThread(lead_id:number, channel:"sms"|"email", campaign_id?:number){
  const s = await ensureStoreShape();
  let th = s.threads.find((t:any)=> t.lead_id===lead_id && t.channel===channel && (campaign_id ? t.campaign_id===campaign_id : true));
  if(!th){
    th = {
      id: Date.now() + Math.floor(Math.random()*1000),
      lead_id, channel,
      last_message_snippet: "",
      last_sender: "agent",
      unread: false,
      campaign_id: campaign_id ?? null,
      updated_at: nowISO()
    };
    s.threads.unshift(th);
    await saveStore(s);
  }
  return th;
}

export async function sendOutbound(lead_id:number, channel:"sms"|"email", body:string, campaign_id?:number, status?: MessageStatus){
  const s = await ensureStoreShape();
  const th = await upsertThread(lead_id, channel, campaign_id)!;
  const msg = {
    id: Date.now(),
    thread_id: th.id,
    direction: "out" as Dir,
    sender: "agent",
    body,
    created_at: nowISO(),
    status: status || "sent" as MessageStatus,
    messageId: null  // Will be populated with Twilio message ID
  };
  s.messages.push(msg);
  const t = s.threads.find((x:any)=> x.id===th.id)!;
  t.last_message_snippet = body;
  t.last_sender = "agent";
  t.unread = false;
  t.updated_at = msg.created_at;
  await saveStore(s);
  return th.id;
}

// Update message status (for delivery confirmations)
export async function updateMessageStatus(messageId: number, status: MessageStatus, twilioMessageId?: string){
  const s = await ensureStoreShape();
  const msg = s.messages.find((m: any) => m.id === messageId);
  if (msg) {
    msg.status = status;
    if (twilioMessageId) {
      msg.messageId = twilioMessageId;
    }
    await saveStore(s);
  }
}

export async function simulateInbound(thread_id:number, body:string){
  const s = await ensureStoreShape();
  const msg = {
    id: Date.now(),
    thread_id,
    direction: "in" as Dir,
    sender: "lead",
    body,
    created_at: nowISO(),
    status: "delivered" as MessageStatus
  };
  s.messages.push(msg);
  const t = s.threads.find((x:any)=> x.id===thread_id);
  if(t){
    t.last_message_snippet = body;
    t.last_sender = "lead";
    t.unread = true;
    t.updated_at = msg.created_at;
  }
  await saveStore(s);
}

// Get message status icon/color
export function getMessageStatusIcon(status: MessageStatus): { icon: string; color: string } {
  switch (status) {
    case 'pending':
      return { icon: '⏱', color: 'text-gray-400' };
    case 'sent':
      return { icon: '✓', color: 'text-blue-400' };
    case 'delivered':
      return { icon: '✓✓', color: 'text-blue-500' };
    case 'read':
      return { icon: '✓✓', color: 'text-blue-600' };
    case 'failed':
      return { icon: '✗', color: 'text-red-500' };
    default:
      return { icon: '', color: '' };
  }
}
