import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const campaignName = formData.get("campaignName") as string || "";
    const addTags = JSON.parse(formData.get("tags") as string || "[]");

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Read file content
    const buffer = await file.arrayBuffer();
    const content = Buffer.from(buffer).toString("utf-8");

    // Check file type
    const fileType = file.name.toLowerCase().endsWith('.csv') ? 'csv'
                   : file.name.toLowerCase().endsWith('.txt') ? 'txt'
                   : file.name.toLowerCase().endsWith('.json') ? 'json'
                   : 'unknown';

    let leads: Lead[] = [];

    if (fileType === 'csv' || fileType === 'txt') {
      // Use AI to parse the document
      const apiKey = process.env.OPENAI_API_KEY;

      const prompt = `You are a data extraction expert. Parse this document and extract lead information.

Document content:
${content.slice(0, 10000)} ${content.length > 10000 ? '... (truncated)' : ''}

Extract ALL leads/contacts from this document. For each person, try to find:
- first_name
- last_name
- phone (format as clean number)
- email
- state (2-letter code if available)
- Any other relevant information as additional fields

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "leads": [
    {
      "first_name": "John",
      "last_name": "Doe",
      "phone": "5551234567",
      "email": "john@example.com",
      "state": "CA"
    }
  ]
}

Important:
- If the document is CSV format, parse all rows
- Extract as much information as possible from each entry
- Clean phone numbers (remove dashes, spaces, parentheses)
- Return empty array if no leads found
- Be liberal in what you accept - any person/contact is a lead`;

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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
      }

      const completion = await response.json();
      const responseText = completion.choices[0]?.message?.content?.trim();

      if (!responseText) {
        return NextResponse.json(
          { error: "Failed to parse document" },
          { status: 500 }
        );
      }

      // Clean up potential markdown formatting
      let cleanedResponse = responseText;
      if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.replace(/^```json\n/, "").replace(/\n```$/, "");
      } else if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.replace(/^```\n/, "").replace(/\n```$/, "");
      }

      try {
        const parsedData = JSON.parse(cleanedResponse);
        leads = parsedData.leads || [];
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        console.error("Raw response:", responseText);
        return NextResponse.json(
          { error: "Failed to parse AI response" },
          { status: 500 }
        );
      }
    } else if (fileType === 'json') {
      // Direct JSON parse
      try {
        const jsonData = JSON.parse(content);
        leads = Array.isArray(jsonData) ? jsonData : (jsonData.leads || []);
      } catch (e) {
        return NextResponse.json(
          { error: "Invalid JSON format" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload CSV, TXT, or JSON files." },
        { status: 400 }
      );
    }

    // Add tags and campaign to leads
    const normalizedLeads = leads.map((lead, i) => ({
      ...lead,
      id: lead.id || `doc_${Date.now()}_${i}`,
      tags: [...(lead.tags || []), ...addTags],
      campaign: campaignName || lead.campaign,
      status: lead.status || "new"
    }));

    // Save to leads.json
    const dataDir = path.join(process.cwd(), "data");
    ensureDir(dataDir);

    const leadsFile = path.join(dataDir, "leads.json");
    const existingLeads: Lead[] = readJsonSafe<Lead[]>(leadsFile, []);

    // Merge leads (avoid duplicates based on phone or email)
    const merged: Lead[] = [...existingLeads];
    for (const newLead of normalizedLeads) {
      const exists = existingLeads.find(
        (existing) =>
          (newLead.phone && existing.phone === newLead.phone) ||
          (newLead.email && existing.email === newLead.email)
      );
      if (!exists) {
        merged.push(newLead);
      }
    }

    fs.writeFileSync(leadsFile, JSON.stringify(merged, null, 2), "utf8");

    // Update campaigns if provided
    if (campaignName) {
      const campaignsFile = path.join(dataDir, "campaigns.json");
      let campaigns = readJsonSafe<any[]>(campaignsFile, []);

      const found = campaigns.find(c => String(c.name).toLowerCase() === campaignName.toLowerCase());
      const leadIds = normalizedLeads.map(l => String(l.id));

      if (found) {
        found.lead_ids = Array.from(new Set([...(found.lead_ids || []), ...leadIds]));
        found.lead_count = found.lead_ids.length;
        found.updated_at = new Date().toISOString();
      } else {
        campaigns.push({
          id: `cmp_${Date.now()}`,
          name: campaignName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags_applied: addTags,
          lead_ids: leadIds,
          lead_count: leadIds.length
        });
      }

      fs.writeFileSync(campaignsFile, JSON.stringify(campaigns, null, 2), "utf8");
    }

    return NextResponse.json({
      success: true,
      message: `Successfully parsed and imported ${normalizedLeads.length} leads`,
      leadsAdded: normalizedLeads.length,
      totalLeads: merged.length,
      pointsUsed: fileType === 'csv' || fileType === 'txt' ? 3 : 0 // AI parsing costs 3 points
    });
  } catch (error: any) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload document" },
      { status: 500 }
    );
  }
}
