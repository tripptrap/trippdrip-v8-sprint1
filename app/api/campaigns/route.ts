import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const p = path.join(process.cwd(), "data", "campaigns.json");
  try {
    const raw = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "[]";
    const json = JSON.parse(raw);
    return NextResponse.json({ ok: true, items: json });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
