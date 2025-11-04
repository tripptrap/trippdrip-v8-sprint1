export type Step = { id:number; type:'sms'|'email'; body:string; delayHours:number };
export type Campaign = {
  id:number;
  name:string;
  status:'Draft'|'Running'|'Paused'|'Completed';
  created_at:string;
  filters?: { states?: string[]; tags?: string[]; repliedOnly?: boolean };
  fromNumbers?: string[]; // e164 pool (local presence later)
  sendWindow?: { start:string; end:string; tz:string }; // "09:00"-"20:00"
  steps: Step[];
  stats?: { sent:number; replied:number; failed:number };
};

const KEY = "trippdrip.campaigns.v1";

export function loadCampaigns(): Campaign[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function saveCampaigns(list: Campaign[]){
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(list));
}
export function ensureCampaignSeed(){
  const existing = loadCampaigns();
  if (existing.length) return;
  const seed: Campaign[] = [
    {
      id: 1001,
      name: "IUL Re-Engage",
      status: "Paused",
      created_at: new Date().toISOString(),
      filters: { repliedOnly: false, states: ["FL","GA"], tags: ["IUL","Followup"] },
      fromNumbers: ["+14075550111","+17025550122"],
      sendWindow: { start: "09:00", end: "20:00", tz: "America/New_York" },
      steps: [
        { id: 1, type:"sms",   delayHours: 0,  body: "Hey {{first}}, still open to an IUL that grows value over time?" },
        { id: 2, type:"sms",   delayHours: 24, body: "Quick one—are you still comparing options or did you handle this?" },
        { id: 3, type:"email", delayHours: 48, body: "Subject: Quick IUL options\n\n{{first}}, here are 2 simple IUL paths. Reply and I’ll tailor in 2 mins." }
      ],
      stats: { sent: 238, replied: 61, failed: 3 }
    },
    {
      id: 1002,
      name: "Truck Driver Family Protection",
      status: "Draft",
      created_at: new Date().toISOString(),
      filters: { states: ["TX","NC","FL"], tags:["Truck Driver","Family"] },
      fromNumbers: ["+18135550133"],
      sendWindow: { start: "10:00", end: "19:00", tz: "America/Chicago" },
      steps: [
        { id: 1, type:"sms", delayHours: 0, body:"Hey {{first}}, this is Tripp with ELS—looking at family protection plans that fit driver schedules. Want the 30-sec version?" }
      ],
      stats: { sent: 0, replied: 0, failed: 0 }
    }
  ];
  saveCampaigns(seed);
}
export function upsertCampaign(c: Campaign){
  const list = loadCampaigns();
  const i = list.findIndex(x=>x.id===c.id);
  if(i>=0) list[i]=c; else list.unshift(c);
  saveCampaigns(list);
}
export function removeCampaign(id:number){
  saveCampaigns(loadCampaigns().filter(c=>c.id!==id));
}
export function newCampaign(): Campaign {
  return {
    id: Date.now(),
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
