export type Step = { id:number; type:'sms'|'email'; body:string; delayHours:number };
export type Campaign = {
  id:string;
  name:string;
  status:'Draft'|'Running'|'Paused'|'Completed';
  created_at:string;
  filters?: { states?: string[]; tags?: string[]; repliedOnly?: boolean };
  fromNumbers?: string[]; // e164 pool (local presence later)
  sendWindow?: { start:string; end:string; tz:string }; // "09:00"-"20:00"
  steps: Step[];
  stats?: { sent:number; replied:number; failed:number };
};

export async function loadCampaigns(): Promise<Campaign[]> {
  if (typeof window === "undefined") return [];

  try {
    const response = await fetch('/api/campaigns');
    const data = await response.json();

    if (data.ok && data.campaigns) {
      return data.campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        created_at: c.created_at,
        filters: c.filters,
        fromNumbers: c.from_numbers,
        sendWindow: c.send_window,
        steps: c.steps,
        stats: c.stats
      }));
    }

    return [];
  } catch (error) {
    console.error('Error loading campaigns:', error);
    return [];
  }
}

export async function saveCampaigns(list: Campaign[]): Promise<void> {
  if (typeof window === "undefined") return;

  // This function is kept for backward compatibility
  // But in practice, use upsertCampaign for individual saves
  for (const campaign of list) {
    await upsertCampaign(campaign);
  }
}
export async function ensureCampaignSeed(): Promise<void> {
  const existing = await loadCampaigns();
  if (existing.length) return;

  // Seed campaigns will be added via API
  const seed = [
    {
      name: "IUL Re-Engage",
      status: "Paused" as const,
      filters: { repliedOnly: false, states: ["FL","GA"], tags: ["IUL","Followup"] },
      fromNumbers: ["+14075550111","+17025550122"],
      sendWindow: { start: "09:00", end: "20:00", tz: "America/New_York" },
      steps: [
        { id: 1, type:"sms" as const,   delayHours: 0,  body: "Hey {{first}}, still open to an IUL that grows value over time?" },
        { id: 2, type:"sms" as const,   delayHours: 24, body: "Quick one—are you still comparing options or did you handle this?" },
        { id: 3, type:"email" as const, delayHours: 48, body: "Subject: Quick IUL options\n\n{{first}}, here are 2 simple IUL paths. Reply and I'll tailor in 2 mins." }
      ],
      stats: { sent: 238, replied: 61, failed: 3 }
    },
    {
      name: "Truck Driver Family Protection",
      status: "Draft" as const,
      filters: { states: ["TX","NC","FL"], tags:["Truck Driver","Family"] },
      fromNumbers: ["+18135550133"],
      sendWindow: { start: "10:00", end: "19:00", tz: "America/Chicago" },
      steps: [
        { id: 1, type:"sms" as const, delayHours: 0, body:"Hey {{first}}, this is Tripp with ELS—looking at family protection plans that fit driver schedules. Want the 30-sec version?" }
      ],
      stats: { sent: 0, replied: 0, failed: 0 }
    }
  ];

  for (const campaign of seed) {
    await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaign)
    });
  }
}

export async function upsertCampaign(c: Campaign): Promise<void> {
  try {
    const method = c.id && c.id.includes('-') ? 'PUT' : 'POST';

    await fetch('/api/campaigns', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: c.id,
        name: c.name,
        status: c.status,
        filters: c.filters,
        fromNumbers: c.fromNumbers,
        sendWindow: c.sendWindow,
        steps: c.steps,
        stats: c.stats
      })
    });
  } catch (error) {
    console.error('Error upserting campaign:', error);
  }
}

export async function removeCampaign(id: string): Promise<void> {
  try {
    await fetch(`/api/campaigns?id=${id}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Error removing campaign:', error);
  }
}

export function newCampaign(): Campaign {
  return {
    id: crypto.randomUUID(),
    name: "New Campaign",
    status: "Draft",
    created_at: new Date().toISOString(),
    filters: { repliedOnly:false, states: [], tags: [] },
    fromNumbers: [],
    sendWindow: { start:"09:00", end:"20:00", tz:"America/New_York" },
    steps: [{ id:1, type:'sms', delayHours:0, body:"Hey {{first}}, quick question…" }],
    stats: { sent:0, replied:0, failed:0 }
  };
}
