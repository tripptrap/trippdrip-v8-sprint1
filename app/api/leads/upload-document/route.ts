import { NextRequest, NextResponse } from "next/server";
import { spendPointsForAction } from "@/lib/pointsSupabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Lead = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  status?: string;
  [k: string]: any;
};

/* ---------- File parsers ---------- */

async function parseXLSX(buf: Buffer) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as any);
  const ws = workbook.worksheets[0];
  if (!ws) return [];

  let headerRowIndex = 1;
  while (headerRowIndex <= ws.rowCount && ws.getRow(headerRowIndex).cellCount === 0) headerRowIndex++;
  const headerRow = ws.getRow(headerRowIndex);

  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, string>[] = [];
  for (let r = headerRowIndex + 1; r <= ws.rowCount && rows.length < 20000; r++) {
    const row = ws.getRow(r);
    if (!row) continue;
    const obj: Record<string, string> = {};
    for (let c = 1; c <= Math.min(headers.length, 80); c++) {
      const key = (headers[c - 1] || "").toString().trim();
      if (!key) continue;
      const v = row.getCell(c)?.value;
      obj[key] = (typeof v === "object" && v && "text" in (v as any)) ? String((v as any).text ?? "") : String(v ?? "");
    }
    if (Object.values(obj).some(v => String(v).trim())) rows.push(obj);
  }
  return rows;
}

async function parseCSV(buf: Buffer, delimiter = ","): Promise<Record<string, any>[]> {
  const { parse } = await import("csv-parse/sync");
  return parse(buf.toString("utf8"), { columns: true, skip_empty_lines: true, delimiter, relax_column_count: true });
}

async function parsePDF(buf: Buffer) {
  const pdfParse = await import("pdf-parse");
  const pdf = (pdfParse as any).default || pdfParse;
  const data = await pdf(buf);
  return data.text || "";
}

async function parseDOCX(buf: Buffer) {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/* ---------- Helpers ---------- */

function normalizePhone(p?: string) {
  const d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

function mapRow(row: Record<string, any>): Lead {
  const obj: Lead = {};
  let rawName = "", rawFirst = "", rawLast = "";
  for (const [kRaw, v] of Object.entries(row)) {
    const k = kRaw.trim().toLowerCase();
    const val = String(v ?? "").trim();
    if (/^name$|full\s*name|contact|customer/.test(k)) rawName = rawName || val;
    else if (/^first|first\s*name|fname|given/.test(k)) rawFirst = rawFirst || val;
    else if (/^last|last\s*name|lname|surname/.test(k)) rawLast = rawLast || val;
    else if (/mail/.test(k)) obj.email = val;
    else if (/phone|cell|mobile|tel/.test(k)) obj.phone = normalizePhone(val);
    else if (/^st$|state|region/.test(k)) obj.state = val.trim().toUpperCase().slice(0, 2);
    else if (/tag|label|segment|category/.test(k)) obj.tags = String(val).split(/[,|]/).map(s => s.trim()).filter(Boolean);
    else if (k === "status") obj.status = val;
  }
  if (rawFirst || rawLast) {
    obj.first_name = rawFirst;
    obj.last_name = rawLast;
  } else if (rawName) {
    const parts = rawName.split(/\s+/).filter(Boolean);
    obj.first_name = parts[0] || "";
    obj.last_name = parts.slice(1).join(" ") || "";
  }
  obj.first_name = (obj.first_name || "").trim();
  obj.last_name = (obj.last_name || "").trim();
  obj.status = obj.status || "new";
  return obj;
}

function detectKind(name: string, type: string) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "tsv") return "tsv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "json") return "json";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (/sheet|excel/.test(type)) return "xlsx";
  if (/csv/.test(type)) return "csv";
  if (/pdf/.test(type)) return "pdf";
  if (/word/.test(type)) return "docx";
  if (/json/.test(type)) return "json";
  return "txt";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const campaignName = formData.get("campaignName") as string || "";
    const addTags = JSON.parse(formData.get("tags") as string || "[]");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Check and deduct points BEFORE processing (5 points for document upload with AI)
    const pointsResult = await spendPointsForAction('document_upload', 1);
    if (!pointsResult.success) {
      return NextResponse.json(
        { error: pointsResult.error || 'Insufficient points. Document upload with AI processing costs 5 points.' },
        { status: 402 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const kind = detectKind(file.name || "upload", file.type || "");

    let leads: Lead[] = [];

    if (kind === "csv" || kind === "tsv") {
      const table = await parseCSV(buf, kind === "tsv" ? "\t" : ",");
      leads = table.map(mapRow);
    } else if (kind === "xlsx") {
      const table = await parseXLSX(buf);
      leads = table.map(mapRow);
    } else if (kind === "json") {
      try {
        const jsonData = JSON.parse(buf.toString("utf8"));
        const arr = Array.isArray(jsonData) ? jsonData : (jsonData.leads || []);
        leads = arr.map(mapRow);
      } catch {
        return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
      }
    } else if (kind === "pdf") {
      const text = await parsePDF(buf);
      leads = await aiExtractLeads(text);
    } else if (kind === "docx") {
      const text = await parseDOCX(buf);
      leads = await aiExtractLeads(text);
    } else {
      // Plain text — use AI extraction
      const text = buf.toString("utf8");
      leads = await aiExtractLeads(text);
    }

    // Add tags and campaign to leads
    const normalizedLeads = leads.map((lead, i) => ({
      ...lead,
      id: `doc_${Date.now()}_${i}`,
      tags: [...(lead.tags || []), ...addTags],
      campaign: campaignName || lead.campaign,
      status: lead.status || "new",
      phone: normalizePhone(lead.phone),
    }));

    return NextResponse.json({
      success: true,
      message: `Successfully parsed ${normalizedLeads.length} leads from ${kind.toUpperCase()} file`,
      leads: normalizedLeads,
      leadsAdded: normalizedLeads.length,
      pointsUsed: 5,
      remainingBalance: pointsResult.balance,
    });
  } catch (error: any) {
    console.error("Error uploading document:", error);
    return NextResponse.json({ error: error.message || "Failed to upload document" }, { status: 500 });
  }
}

/* ---------- AI extraction for unstructured text ---------- */
async function aiExtractLeads(text: string): Promise<Lead[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !text.trim()) return [];

  const prompt = `You are a data extraction expert. Parse this document and extract lead information.

Document content:
${text.slice(0, 10000)}${text.length > 10000 ? ' ... (truncated)' : ''}

Extract ALL leads/contacts from this document. For each person, try to find:
- first_name
- last_name
- phone (format as clean number)
- email
- state (2-letter code if available)

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "leads": [
    { "first_name": "John", "last_name": "Doe", "phone": "5551234567", "email": "john@example.com", "state": "CA" }
  ]
}

Important:
- Extract as much information as possible from each entry
- Clean phone numbers (remove dashes, spaces, parentheses)
- Return empty array if no leads found`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a data extraction expert. Return only valid JSON, no markdown formatting." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) return [];

    const completion = await response.json();
    let responseText = completion.choices[0]?.message?.content?.trim() || "";

    // Clean up potential markdown formatting
    if (responseText.startsWith("```json")) {
      responseText = responseText.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    const parsedData = JSON.parse(responseText);
    return parsedData.leads || [];
  } catch {
    return [];
  }
}
