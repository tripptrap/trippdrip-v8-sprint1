import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  state?: string;
  tags?: string[];
  status?: string;
  [k: string]: any;
};

function readLeadsFile(): Lead[] {
  try {
    const p = path.join(process.cwd(), "data", "leads.json");
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.items)) return parsed.items as Lead[];
    return [];
  } catch {
    return [];
  }
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const tagsParam = (searchParams.get("tags") || "").trim();
  const selectedTags = tagsParam
    ? tagsParam.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  const all = readLeadsFile();

  const tagsAll = uniq(
    all.flatMap(l => Array.isArray(l.tags) ? l.tags.filter(Boolean) : [])
  ).sort((a, b) => a.localeCompare(b));

  const filtered = all.filter(l => {
    const matchesTags =
      selectedTags.length === 0 ||
      (Array.isArray(l.tags) && l.tags.some(t => selectedTags.includes(t)));

    if (!matchesTags) return false;
    if (!search) return true;

    const hay = [
      l.first_name,
      l.last_name,
      l.email,
      l.phone,
      l.state,
      ...(Array.isArray(l.tags) ? l.tags : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hay.includes(search);
  });

  return NextResponse.json({
    items: filtered,
    total: filtered.length,
    tagsAll,
  });
}
