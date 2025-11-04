import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

/* ---------- XLSX via exceljs (safe) ---------- */
async function parseXLSX(buf: Buffer) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as any);
  const ws = workbook.worksheets[0];
  if (!ws) return [];

  // headers = first non-empty row
  let headerRowIndex = 1;
  while (headerRowIndex <= ws.rowCount && ws.getRow(headerRowIndex).cellCount === 0) headerRowIndex++;
  const headerRow = ws.getRow(headerRowIndex);

  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });

  const MAX_ROWS = 20000, MAX_COLS = 80;
  const rows: Record<string, string>[] = [];
  for (let r = headerRowIndex + 1; r <= ws.rowCount && rows.length < MAX_ROWS; r++) {
    const row = ws.getRow(r);
    if (!row) continue;
    const obj: Record<string, string> = {};
    for (let c = 1; c <= Math.min(headers.length, MAX_COLS); c++) {
      const key = (headers[c - 1] || "").toString().trim();
      if (!key) continue;
      const v = row.getCell(c)?.value;
      obj[key] = (typeof v === "object" && v && "text" in (v as any)) ? String((v as any).text ?? "") : String(v ?? "");
    }
    if (Object.values(obj).some(v => String(v).trim())) rows.push(obj);
  }
  return rows;
}

/* ---------- CSV/TSV ---------- */
async function parseCSV(buf: Buffer, delimiter = ","): Promise<Record<string, any>[]> {
  const { parse } = await import("csv-parse/sync");
  return parse(buf.toString("utf8"), { columns: true, skip_empty_lines: true, delimiter, relax_column_count: true }) as Record<string, any>[];
}

/* ---------- PDF/DOCX/TXT ---------- */
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
type Lead = { first_name?:string; last_name?:string; phone?:string; email?:string; state?:string; tags?:string[]; status?:string; };

function normalizePhone(p?:string){
  const d=(p||"").replace(/\D/g,"");
  if(!d) return "";
  if(d.length===10) return `+1${d}`;
  if(d.length===11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}
const stateMap: Record<string,string> = { alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",delaware:"DE","district of columbia":"DC",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",massachusetts:"MA",michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV","new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA","rhode island":"RI","south carolina":"SC","south dakota":"SD",tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",virginia:"VA",washington:"WA","west virginia":"WV",wisconsin:"WI",wyoming:"WY" };
function normState(s?:string){ if(!s) return ""; const up=s.trim().toUpperCase(); if(up.length===2) return up; const m=stateMap[s.trim().toLowerCase()]; return m||up; }

function splitName(raw?:string){
  if(!raw) return {first_name:"",last_name:""};
  let s = raw.replace(/\s+/g," ").trim();
  // Last, First
  if(/,/.test(s)){
    const [last, first] = s.split(",").map(x=>x.trim());
    return { first_name:first||"", last_name:last||"" };
  }
  // First Middle Last (take first/last tokens)
  const parts = s.split(" ").filter(Boolean);
  if(parts.length===1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts[parts.length-1] };
}

function nameFromEmail(email?:string){
  if(!email) return {first_name:"", last_name:""};
  const user = email.split("@")[0] || "";
  // john.smith or smith_john
  const tokens = user.split(/[._-]+/).filter(Boolean);
  if(tokens.length>=2){
    const a=tokens[0], b=tokens[1];
    // pick the one that looks like a first name by length
    if(a.length<=b.length) return {first_name:cap(a), last_name:cap(b)};
    return {first_name:cap(b), last_name:cap(a)};
  }
  return {first_name:cap(user), last_name:""};
}
function cap(s:string){ return s? s.charAt(0).toUpperCase()+s.slice(1) : s; }

function mapRow(row:Record<string,any>):Lead{
  const obj:Lead={};
  // gather raw fields
  let rawName = "";
  let rawFirst = "";
  let rawLast = "";
  for(const [kRaw,v] of Object.entries(row)){
    const k=kRaw.trim().toLowerCase();
    const val=String(v??"").trim();

    if (/^name$|full\s*name|contact|customer/.test(k)) rawName = rawName || val;
    else if (/^first|first\s*name|fname|given/.test(k)) rawFirst = rawFirst || val;
    else if (/^last|last\s*name|lname|surname/.test(k)) rawLast = rawLast || val;
    else if(/mail/.test(k)) obj.email=val;
    else if(/phone|cell|mobile|tel/.test(k)) obj.phone=normalizePhone(val);
    else if(/^st$|state|region/.test(k)) obj.state=normState(val);
    else if(/tag|label|segment|category/.test(k)) obj.tags=String(val).split(/[,|]/).map(s=>s.trim()).filter(Boolean);
    else if(k==="status") obj.status=val;
  }

  // derive names
  if(rawFirst || rawLast){
    obj.first_name = rawFirst;
    obj.last_name  = rawLast;
  } else if (rawName){
    const n = splitName(rawName);
    obj.first_name = n.first_name; obj.last_name = n.last_name;
  } else if (obj.email){
    const n = nameFromEmail(obj.email);
    obj.first_name = obj.first_name || n.first_name;
    obj.last_name  = obj.last_name  || n.last_name;
  }

  obj.first_name = (obj.first_name||"").trim();
  obj.last_name  = (obj.last_name||"").trim();
  obj.status     = obj.status||"Active";
  return obj;
}

function dedupe(list:Lead[]){
  const seen=new Set<string>(); const out:Lead[]=[];
  for(const l of list){
    const fp=`${(l.first_name||"").toLowerCase()}|${(l.last_name||"").toLowerCase()}|${(l.phone||"").replace(/\D/g,"")}`;
    if(seen.has(fp)) continue; seen.add(fp); out.push(l);
  } return out;
}

async function aiExtract(text:string):Promise<Lead[]>{
  if(!process.env.OPENAI_API_KEY) return [];
  try{
    const openai=new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const rsp=await openai.chat.completions.create({
      model:"gpt-4o-mini",
      temperature:0.1,
      messages:[{role:"user",content:
`Extract a JSON array of leads from text. Keys: first_name, last_name, phone, email, state, tags, status.
- phone: E.164 if possible (+1XXXXXXXXXX), else numeric with +.
- state: two-letter code if present.
- tags: array; status defaults "Active".
Text:
"""${text.slice(0,12000)}"""`}]
    });
    const raw=rsp.choices?.[0]?.message?.content||"[]";
    const arr=JSON.parse(raw);
    return Array.isArray(arr)?arr.map(mapRow):[];
  }catch{ return []; }
}

function detectKind(name:string,type:string){
  const ext=(name.split(".").pop()||"").toLowerCase();
  if(ext==="csv") return "csv";
  if(ext==="tsv") return "tsv";
  if(ext==="xlsx"||ext==="xls") return "xlsx";
  if(ext==="json") return "json";
  if(ext==="pdf") return "pdf";
  if(ext==="docx") return "docx";
  if(/sheet|excel/.test(type)) return "xlsx";
  if(/csv/.test(type)) return "csv";
  if(/pdf/.test(type)) return "pdf";
  if(/word/.test(type)) return "docx";
  if(/json/.test(type)) return "json";
  return "txt";
}

export async function POST(req: Request) {
  try{
    const form=await req.formData();
    const file=form.get("file") as File|null;
    if(!file) return NextResponse.json({ok:false,error:"No file"}, {status:400});

    const MAX=10*1024*1024; if(file.size>MAX) return NextResponse.json({ok:false,error:"File too large (10MB max)"},{status:413});

    const name=(file as any).name||"upload";
    const buf=Buffer.from(await file.arrayBuffer());
    const kind=detectKind(name, file.type||"");

    let table:Record<string,any>[]=[]; let text="";

    if(kind==="csv") table=await parseCSV(buf, ",");
    else if(kind==="tsv") table=await parseCSV(buf, "\t");
    else if(kind==="xlsx") table=await parseXLSX(buf);
    else if(kind==="json"){
      const parsed=JSON.parse(buf.toString("utf8"));
      table = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.leads)? parsed.leads : []);
    } else if(kind==="pdf") text=await parsePDF(buf);
    else if(kind==="docx") text=await parseDOCX(buf);
    else text=buf.toString("utf8");

    let leads:Lead[]=[];
    if(table.length) leads=table.map(mapRow);
    else if(text){
      const ai=await aiExtract(text);
      leads=ai.length?ai:[];
    }

    leads=dedupe(leads).map(l=>({
      first_name:(l.first_name||"").trim(),
      last_name:(l.last_name||"").trim(),
      phone:normalizePhone(l.phone),
      email:(l.email||"").trim(),
      state: normState(l.state),
      tags:Array.isArray(l.tags)?l.tags.filter(Boolean):[],
      status:l.status||"Active",
    }));

    const preview=leads.slice(0,200);
    const columns=["first_name","last_name","phone","email","state","tags","status"];

    return NextResponse.json({ ok:true, detectedType:kind, total:leads.length, columns, preview, all: leads });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||"Parse failed" }, {status:500});
  }
}

