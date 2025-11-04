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

type SendResult = {
  leadId: string;
  phone: string;
  success: boolean;
  messageId?: string;
  error?: string;
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

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

// Personalize message with lead data
function personalizeMessage(template: string, lead: Lead): string {
  let message = template;
  message = message.replace(/\{\{first\}\}/gi, lead.first_name || '');
  message = message.replace(/\{\{last\}\}/gi, lead.last_name || '');
  message = message.replace(/\{\{email\}\}/gi, lead.email || '');
  message = message.replace(/\{\{phone\}\}/gi, lead.phone || '');
  message = message.replace(/\{\{state\}\}/gi, lead.state || '');
  return message.trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const leadIds: string[] = Array.isArray(body?.leadIds) ? body.leadIds.map(String) : [];
    const addTags: string[] = Array.isArray(body?.addTags) ? body.addTags.map((t:any)=>String(t).trim()).filter(Boolean) : [];
    const campaignName: string = body?.campaignName ? String(body.campaignName).trim() : "";
    const messageTemplate: string = body?.message || "";
    const sendSMS: boolean = body?.sendSMS === true;
    const fromNumber: string = body?.fromNumber || "";

    // Points and settings from client
    const userPoints: number = typeof body?.userPoints === 'number' ? body.userPoints : 0;
    const twilioConfig = body?.twilioConfig;
    const checkSpam: boolean = body?.checkSpam !== false;

    if (!campaignName) {
      return NextResponse.json({ ok:false, error:"campaignName required" }, { status:400 });
    }
    if (!leadIds.length) {
      return NextResponse.json({ ok:false, error:"leadIds required" }, { status:400 });
    }

    const dataDir = path.join(process.cwd(), "data");
    ensureDir(dataDir);

    const leadsFile = path.join(dataDir, "leads.json");
    const campaignsFile = path.join(dataDir, "campaigns.json");
    const tagsFile = path.join(dataDir, "tags.json");

    const leads: Lead[] = readJsonSafe<Lead[]>(leadsFile, []);
    const idset = new Set(leadIds.map(String));
    let updatedCount = 0;

    // Get leads to message
    const targetLeads = leads.filter(l => idset.has(String(l.id ?? "")));

    // SMS sending logic
    const sendResults: SendResult[] = [];
    let pointsUsed = 0;
    const costPerSMS = 1; // 1 point per SMS

    if (sendSMS && messageTemplate) {
      // Check if we have enough points
      const totalCost = targetLeads.length * costPerSMS;

      if (userPoints < totalCost) {
        return NextResponse.json({
          ok: false,
          error: `Insufficient points. Need ${totalCost} points, but you have ${userPoints}. Please purchase more points.`,
          pointsNeeded: totalCost,
          pointsAvailable: userPoints
        }, { status: 402 });
      }

      // Check Twilio config
      if (!twilioConfig || !twilioConfig.accountSid || !twilioConfig.authToken) {
        return NextResponse.json({
          ok: false,
          error: 'Twilio not configured. Please add your Twilio credentials in Settings.'
        }, { status: 400 });
      }

      // Check spam risk if enabled
      if (checkSpam) {
        const spamIndicators = [
          'free money', 'click here', 'act now', 'limited time',
          'congratulations', 'you won', 'claim now'
        ];
        const lowerMessage = messageTemplate.toLowerCase();
        const hasSpam = spamIndicators.some(keyword => lowerMessage.includes(keyword));

        if (hasSpam) {
          return NextResponse.json({
            ok: false,
            error: 'Message blocked: High spam risk detected. Please revise your message.',
            spamRisk: true
          }, { status: 400 });
        }
      }

      // Send SMS to each lead
      for (const lead of targetLeads) {
        if (!lead.phone) {
          sendResults.push({
            leadId: String(lead.id),
            phone: '',
            success: false,
            error: 'No phone number'
          });
          continue;
        }

        // Personalize message
        const personalizedMessage = personalizeMessage(messageTemplate, lead);

        // Send via Twilio API
        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`;
          const params = new URLSearchParams();
          params.append('To', lead.phone);
          params.append('From', fromNumber || twilioConfig.phoneNumbers?.[0] || '');
          params.append('Body', personalizedMessage);

          const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
          });

          const result = await response.json();

          if (response.ok) {
            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: true,
              messageId: result.sid
            });
            pointsUsed += costPerSMS;
          } else {
            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: false,
              error: result.message || 'Send failed'
            });
          }
        } catch (error) {
          sendResults.push({
            leadId: String(lead.id),
            phone: lead.phone,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Tag leads (always happens)
    for (const l of leads) {
      const id = String(l.id ?? "");
      if (idset.has(id)) {
        const current = Array.isArray(l.tags) ? l.tags : (l.tags ? String(l.tags).split(",").map((s:string)=>s.trim()) : []);
        l.tags = uniq([...(current||[]), ...addTags]);
        updatedCount++;
      }
    }

    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2), "utf8");

    // Update campaigns
    let campaigns = readJsonSafe<any[]>(campaignsFile, []);
    const ids = leadIds.map(String);
    const found = campaigns.find(c => String(c.name).toLowerCase() === campaignName.toLowerCase());
    let campaignId: string;
    if (found) {
      found.tags_applied = uniq([...(found.tags_applied || []), ...addTags]);
      found.lead_ids = uniq([...(found.lead_ids || []), ...ids]);
      found.lead_count = found.lead_ids.length;
      found.updated_at = new Date().toISOString();
      found.messages_sent = (found.messages_sent || 0) + sendResults.filter(r => r.success).length;
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
        lead_count: ids.length,
        messages_sent: sendResults.filter(r => r.success).length
      });
    }
    fs.writeFileSync(campaignsFile, JSON.stringify(campaigns, null, 2), "utf8");

    // Update tags
    const tagCounts: Record<string, number> = {};
    for (const l of leads) {
      const t = Array.isArray(l.tags) ? l.tags : [];
      for (const tag of t) {
        const k = String(tag).trim();
        if (!k) continue;
        tagCounts[k] = (tagCounts[k] || 0) + 1;
      }
    }
    const tagsArr = Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a,b)=>b.count-a.count);
    fs.writeFileSync(tagsFile, JSON.stringify(tagsArr, null, 2), "utf8");

    const successCount = sendResults.filter(r => r.success).length;
    const failCount = sendResults.filter(r => !r.success).length;

    return NextResponse.json({
      ok: true,
      campaignId,
      updated: updatedCount,
      smsSent: sendSMS,
      sendResults: {
        total: sendResults.length,
        success: successCount,
        failed: failCount,
        details: sendResults
      },
      pointsUsed
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Campaign run failed" }, { status:400 });
  }
}
