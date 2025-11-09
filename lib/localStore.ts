export type StoreShape = { leads:any[]; threads:any[]; messages:any[] };
const EVT = "trippdrip:store-updated";

function broadcast(){
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVT));
  }
}

export async function loadStore(): Promise<StoreShape | null> {
  if (typeof window === "undefined") return null;

  try {
    const response = await fetch('/api/store');
    const data = await response.json();

    if (data.ok && data.store) {
      return data.store;
    }

    return null;
  } catch (error) {
    console.error('Error loading store:', error);
    return null;
  }
}

export async function saveStore(data: StoreShape): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    await fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    broadcast(); // notify listeners in the same tab
  } catch (error) {
    console.error('Error saving store:', error);
  }
}

/** Only seed if store is completely empty (no leads, threads, or messages). Never overwrite existing data. */
export async function ensureSeed(seed: StoreShape): Promise<void> {
  const existing = await loadStore();
  if (!existing) { await saveStore(seed); return; }
  const hasLeads    = Array.isArray(existing.leads)    && existing.leads.length    > 0;
  const hasThreads  = Array.isArray(existing.threads)  && existing.threads.length  > 0;
  const hasMessages = Array.isArray(existing.messages) && existing.messages.length > 0;
  if (!(hasLeads || hasThreads || hasMessages)) await saveStore(seed);
}

export async function exportStore(): Promise<string> {
  const store = await loadStore();
  return JSON.stringify(store ?? {leads:[],threads:[],messages:[]}, null, 2);
}

export async function importStore(text:string): Promise<void> {
  const parsed = JSON.parse(text);
  await saveStore(parsed);
}

export const STORE_UPDATED_EVENT = EVT;
