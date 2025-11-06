import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateSMSCredits } from "@/lib/creditCalculator";

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
    const addTags: string[] = Array.isArray(body?.addTags) ? body.addTags.map((t: any) => String(t).trim()).filter(Boolean) : [];
    const campaignName: string = body?.campaignName ? String(body.campaignName).trim() : "";
    const messageTemplate: string = body?.message || "";
    const sendSMS: boolean = body?.sendSMS === true;
    const fromNumber: string = body?.fromNumber || "";

    // Points and settings from client
    const userPoints: number = typeof body?.userPoints === 'number' ? body.userPoints : 0;
    const twilioConfig = body?.twilioConfig;
    const checkSpam: boolean = body?.checkSpam !== false;

    if (!campaignName) {
      return NextResponse.json({ ok: false, error: "campaignName required" }, { status: 400 });
    }
    if (!leadIds.length) {
      return NextResponse.json({ ok: false, error: "leadIds required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Get leads from Supabase
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id)
      .in('id', leadIds);

    if (leadsError) {
      console.error('Error fetching leads:', leadsError);
      return NextResponse.json({ ok: false, error: leadsError.message }, { status: 500 });
    }

    const targetLeads = leads || [];

    // SMS sending logic
    const sendResults: SendResult[] = [];
    let pointsUsed = 0;
    let totalCreditsUsed = 0;

    if (sendSMS && messageTemplate) {
      // Calculate credits per message based on character count
      const creditCalc = calculateSMSCredits(messageTemplate, 0);
      const creditsPerMessage = creditCalc.credits;
      const totalCost = targetLeads.length * creditsPerMessage;

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
            // Calculate credits for this specific personalized message
            const personalizedCreditCalc = calculateSMSCredits(personalizedMessage, 0);
            const messageCredits = personalizedCreditCalc.credits;

            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: true,
              messageId: result.sid
            });
            pointsUsed += messageCredits;
            totalCreditsUsed += messageCredits;

            // Create or update thread
            const { data: existingThread } = await supabase
              .from('threads')
              .select('*')
              .eq('user_id', user.id)
              .eq('lead_id', lead.id)
              .single();

            if (existingThread) {
              // Update existing thread
              await supabase
                .from('threads')
                .update({
                  messages_from_user: (existingThread.messages_from_user || 0) + 1,
                  last_message_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingThread.id);
            } else {
              // Create new thread
              const { data: newThread } = await supabase
                .from('threads')
                .insert({
                  user_id: user.id,
                  lead_id: lead.id,
                  messages_from_user: 1,
                  messages_from_lead: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  last_message_at: new Date().toISOString()
                })
                .select()
                .single();

              // Save message to database
              if (newThread) {
                await supabase
                  .from('messages')
                  .insert({
                    user_id: user.id,
                    thread_id: newThread.id,
                    lead_id: lead.id,
                    direction: 'outbound',
                    content: personalizedMessage,
                    status: 'sent',
                    created_at: new Date().toISOString()
                  });
              }
            }
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
    for (const lead of targetLeads) {
      const currentTags = Array.isArray(lead.tags) ? lead.tags : [];
      const mergedTags = Array.from(new Set([...currentTags, ...addTags]));

      await supabase
        .from('leads')
        .update({
          tags: mergedTags,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id)
        .eq('user_id', user.id);
    }

    // Create or update campaign
    const { data: existingCampaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', campaignName);

    let campaignId: string;

    if (existingCampaigns && existingCampaigns.length > 0) {
      // Update existing campaign
      const found = existingCampaigns[0];
      const currentLeadIds = Array.isArray(found.lead_ids) ? found.lead_ids : [];
      const currentTags = Array.isArray(found.tags_applied) ? found.tags_applied : [];

      await supabase
        .from('campaigns')
        .update({
          tags_applied: Array.from(new Set([...currentTags, ...addTags])),
          lead_ids: Array.from(new Set([...currentLeadIds, ...leadIds])),
          lead_count: Array.from(new Set([...currentLeadIds, ...leadIds])).length,
          messages_sent: (found.messages_sent || 0) + sendResults.filter(r => r.success).length,
          credits_used: (found.credits_used || 0) + totalCreditsUsed,
          updated_at: new Date().toISOString()
        })
        .eq('id', found.id);

      campaignId = String(found.id);
    } else {
      // Create new campaign
      const { data: newCampaign } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name: campaignName,
          tags_applied: addTags,
          lead_ids: leadIds,
          lead_count: leadIds.length,
          messages_sent: sendResults.filter(r => r.success).length,
          credits_used: totalCreditsUsed,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      campaignId = newCampaign ? String(newCampaign.id) : '';
    }

    const successCount = sendResults.filter(r => r.success).length;
    const failCount = sendResults.filter(r => !r.success).length;

    return NextResponse.json({
      ok: true,
      campaignId,
      updated: targetLeads.length,
      smsSent: sendSMS,
      sendResults: {
        total: sendResults.length,
        success: successCount,
        failed: failCount,
        details: sendResults
      },
      pointsUsed,
      creditsUsed: totalCreditsUsed
    });
  } catch (e: any) {
    console.error('Error in campaign run:', e);
    return NextResponse.json({ ok: false, error: e?.message || "Campaign run failed" }, { status: 500 });
  }
}
