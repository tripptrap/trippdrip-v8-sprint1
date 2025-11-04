import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  status?: string;
  [k: string]: any;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJsonSafe<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function uniq<T>(a: T[]) {
  return Array.from(new Set(a));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const incoming = Array.isArray(body?.items) ? body.items : (Array.isArray(body?.rows) ? body.rows : []);
    const addTags = Array.isArray(body?.addTags) ? body.addTags.map((t: any)=>String(t).trim()).filter(Boolean) : [];
    const campaignName = body?.campaignName ? String(body.campaignName).trim() : "";

    const dataDir = path.join(process.cwd(), "data");
    ensureDir(dataDir);

    const leadsFile = path.join(dataDir, "leads.json");
    const campaignsFile = path.join(dataDir, "campaigns.json");
    const tagsFile = path.join(dataDir, "tags.json");

    const backup = path.join(dataDir, `leads_backup_${Date.now()}.json`);
    if (fs.existsSync(leadsFile)) fs.copyFileSync(leadsFile, backup);

    const existingLeads: Lead[] = readJsonSafe<Lead[]>(leadsFile, []);
    const inNorm: Lead[] = (incoming || []).map((l: any, i: number) => {
      const id = l?.id ?? `imp_${Date.now()}_${i}`;
      const current = Array.isArray(l?.tags) ? l.tags : (l?.tags ? String(l.tags).split(",").map((s:string)=>s.trim()) : []);
      return { ...l, id: String(id), tags: uniq([...(current||[]), ...addTags]) };
    });

    const merged: Lead[] = [];
    const seen = new Set<string>();
    for (const l of [...existingLeads, ...inNorm]) {
      const key = `${String(l.id ?? "")}|${String(l.phone ?? "")}|${String(l.email ?? "")}`;
      if (!seen.has(key)) { seen.add(key); merged.push(l); }
    }

    fs.writeFileSync(leadsFile, JSON.stringify(merged, null, 2), "utf8");

    let campaigns = readJsonSafe<any[]>(campaignsFile, []);
    let campaignId: string | null = null;
    if (campaignName) {
      const found = campaigns.find(c => String(c.name).toLowerCase() === campaignName.toLowerCase());
      const ids = inNorm.map(l => String(l.id));
      if (found) {
        found.tags_applied = uniq([...(found.tags_applied || []), ...addTags]);
        found.lead_ids = uniq([...(found.lead_ids || []), ...ids]);
        found.lead_count = found.lead_ids.length;
        found.updated_at = new Date().toISOString();
        campaignId = String(found.id);
      } else {
        campaignId = `cmp_${Date.now()}`;
        campaigns.push({
          id: campaignId,
          name: campaignName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags_applied: addTags,
          lead_ids: ids,
          lead_count: ids.length
        });
      }
      fs.writeFileSync(campaignsFile, JSON.stringify(campaigns, null, 2), "utf8");
    }

    const tagCounts: Record<string, number> = {};
    for (const l of merged) {
      const t = Array.isArray(l.tags) ? l.tags : [];
      for (const tag of t) {
        const k = String(tag).trim();
        if (!k) continue;
        tagCounts[k] = (tagCounts[k] || 0) + 1;
      }
    }
    const tagsArr = Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a,b)=>b.count-a.count);
    fs.writeFileSync(tagsFile, JSON.stringify(tagsArr, null, 2), "utf8");

    return NextResponse.json({ ok: true, message: "leads successfully uploaded", campaignId, added: inNorm.length, total: merged.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Import failed" }, { status: 400 });
  }
}
