export type StoreShape = { leads:any[]; threads:any[]; messages:any[] };
const KEY = "trippdrip.store.v1";
const EVT = "trippdrip:store-updated";

function broadcast(){
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVT));
  }
}

export function loadStore(): StoreShape | null {
  if (typeof window === "undefined") return null;
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveStore(data: StoreShape){
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(data));
    broadcast(); // <-- notify listeners in the same tab
  }
}

/** Only seed if store is completely empty (no leads, threads, or messages). Never overwrite existing data. */
export function ensureSeed(seed: StoreShape){
  const existing = loadStore();
  if (!existing) { saveStore(seed); return; }
  const hasLeads    = Array.isArray(existing.leads)    && existing.leads.length    > 0;
  const hasThreads  = Array.isArray(existing.threads)  && existing.threads.length  > 0;
  const hasMessages = Array.isArray(existing.messages) && existing.messages.length > 0;
  if (!(hasLeads || hasThreads || hasMessages)) saveStore(seed);
}

export function exportStore(){ return JSON.stringify(loadStore() ?? {leads:[],threads:[],messages:[]}, null, 2); }
export function importStore(text:string){
  const parsed = JSON.parse(text);
  saveStore(parsed);
}
export const STORE_UPDATED_EVENT = EVT;
