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
  campaign?: string;
  status?: string;
  [k: string]: any;
};

function readLeads(): Lead[] {
  const p = path.join(process.cwd(), "data", "leads.json");
  try {
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}

function matchesQuery(l: Lead, q: string) {
  const hay = [
    l.first_name, l.last_name, l.email, l.phone, l.state, l.status,
    ...(Array.isArray(l.tags) ? l.tags : [])
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function hasAllTags(l: Lead, need: string[]) {
  const t = new Set((Array.isArray(l.tags) ? l.tags : []).map(String));
  return need.every(x => t.has(x));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const tags = (url.searchParams.get("tags") || "").split(",").map(s=>s.trim()).filter(Boolean);
  const campaign = (url.searchParams.get("campaign") || "").trim();

  let items = readLeads();

  if (q) items = items.filter(l => matchesQuery(l, q));
  if (tags.length) items = items.filter(l => hasAllTags(l, tags));
  if (campaign) items = items.filter(l => l.campaign === campaign);

  return NextResponse.json({ ok: true, items });
}
