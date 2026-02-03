import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateSMSCredits } from "@/lib/creditCalculator";
import { selectClosestNumber } from "@/lib/geo/selectClosestNumber";
import { detectSpam } from "@/lib/spam/detector";
import { sendTelnyxSMS } from "@/lib/telnyx";

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

    // Create or get campaign FIRST so we have campaignId for thread tracking
    const { data: existingCampaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', campaignName);

    let campaignId: string;

    if (existingCampaigns && existingCampaigns.length > 0) {
      // Use existing campaign
      campaignId = String(existingCampaigns[0].id);
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
          messages_sent: 0,
          credits_used: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      campaignId = newCampaign ? String(newCampaign.id) : '';
    }

    // Fetch user's opt-out keyword
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('opt_out_keyword')
      .eq('user_id', user.id)
      .single();
    const optOutKeyword = userSettings?.opt_out_keyword || null;

    // SMS sending logic
    const sendResults: SendResult[] = [];
    let pointsUsed = 0;
    let totalCreditsUsed = 0;

    if (sendSMS && messageTemplate) {
      // Block if opt-out keyword not configured
      if (!optOutKeyword) {
        return NextResponse.json({
          ok: false,
          error: 'Opt-out keyword not configured. Please set one in Settings > DNC List before sending campaigns.'
        }, { status: 400 });
      }
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
      let dncSkipped = 0;
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

        // Check DNC list before sending
        const { data: dncCheck, error: dncError } = await supabase.rpc('check_dnc', {
          p_user_id: user.id,
          p_phone_number: lead.phone
        });

        if (!dncError && dncCheck) {
          const dncResult = typeof dncCheck === 'string' ? JSON.parse(dncCheck) : dncCheck;
          if (dncResult.on_dnc_list) {
            console.log(`🚫 Campaign skip - ${lead.phone} is on DNC list (${dncResult.on_user_list ? 'user' : 'global'} list)`);
            // Log blocked attempt
            await supabase.from('dnc_history').insert({
              user_id: user.id,
              phone_number: lead.phone,
              normalized_phone: dncResult.normalized_phone,
              action: 'blocked',
              list_type: dncResult.on_user_list ? 'user' : 'global',
              result: true,
              metadata: {
                reason: dncResult.reason,
                source: dncResult.source,
                campaign_id: campaignId,
                campaign_name: campaignName
              }
            });
            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: false,
              error: `Skipped: On DNC list (${dncResult.reason || 'opted out'})`
            });
            dncSkipped++;
            continue;
          }
        }

        // Personalize message
        const personalizedMessage = personalizeMessage(messageTemplate, lead);

        // Send via Telnyx API
        try {
          // Geo-route: pick closest number to lead's zip code
          const geoFrom = await selectClosestNumber(user.id, lead.zip_code || null, supabase);
          const effectiveFrom = geoFrom || fromNumber || '';

          // Check if this is the first message to this lead (for opt-out footer)
          let isFirstMessageToLead = true;
          const { data: existThreadCheck } = await supabase
            .from('threads')
            .select('id')
            .eq('user_id', user.id)
            .or(`lead_id.eq.${lead.id},phone_number.eq.${lead.phone}`)
            .limit(1)
            .single();
          if (existThreadCheck) {
            isFirstMessageToLead = false;
          }

          // Append opt-out footer on first message to lead
          const messageToSend = isFirstMessageToLead
            ? `${personalizedMessage}\n\nReply ${optOutKeyword} to opt out`
            : personalizedMessage;

          const result = await sendTelnyxSMS({
            to: lead.phone,
            message: messageToSend,
            from: effectiveFrom || undefined,
          });

          if (result.success) {
            // Calculate credits for this specific personalized message
            const personalizedCreditCalc = calculateSMSCredits(personalizedMessage, 0);
            const messageCredits = personalizedCreditCalc.credits;

            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: true,
              messageId: result.messageSid
            });
            pointsUsed += messageCredits;
            totalCreditsUsed += messageCredits;

            // Create or update thread - check by lead_id OR phone_number to avoid duplicates
            let existingThread = null;

            // First try by lead_id
            const { data: threadByLead } = await supabase
              .from('threads')
              .select('*')
              .eq('user_id', user.id)
              .eq('lead_id', lead.id)
              .single();

            if (threadByLead) {
              existingThread = threadByLead;
            } else if (lead.phone) {
              // Try by phone number if no lead match
              const { data: threadByPhone } = await supabase
                .from('threads')
                .select('*')
                .eq('user_id', user.id)
                .eq('phone_number', lead.phone)
                .single();

              if (threadByPhone) {
                existingThread = threadByPhone;
                // Also link lead_id since we found a match
                await supabase
                  .from('threads')
                  .update({ lead_id: lead.id })
                  .eq('id', threadByPhone.id);
              }
            }

            if (existingThread) {
              // Update existing thread - only set campaign_id if not already set (preserve individual origins)
              const updateData: any = {
                messages_from_user: (existingThread.messages_from_user || 0) + 1,
                last_message: personalizedMessage,
                updated_at: new Date().toISOString()
              };
              // Only set campaign_id if thread doesn't have one (new campaign thread)
              if (!existingThread.campaign_id) {
                updateData.campaign_id = campaignId || null;
              }
              // Also ensure phone_number is set if missing
              if (!existingThread.phone_number && lead.phone) {
                updateData.phone_number = lead.phone;
              }
              await supabase
                .from('threads')
                .update(updateData)
                .eq('id', existingThread.id);

              // Save the message to database with spam score
              const spamResult1 = detectSpam(personalizedMessage);
              await supabase
                .from('messages')
                .insert({
                  user_id: user.id,
                  thread_id: existingThread.id,
                  from_phone: effectiveFrom,
                  to_phone: lead.phone,
                  body: personalizedMessage,
                  content: personalizedMessage,
                  direction: 'outbound',
                  status: 'sent',
                  channel: 'sms',
                  provider: 'telnyx',
                  message_sid: result.messageSid,
                  spam_score: spamResult1.spamScore,
                  spam_flags: spamResult1.detectedWords.map(w => w.word),
                  created_at: new Date().toISOString()
                });
            } else {
              // Create new thread with campaign_id
              const { data: newThread } = await supabase
                .from('threads')
                .insert({
                  user_id: user.id,
                  lead_id: lead.id,
                  phone_number: lead.phone,
                  channel: 'sms',
                  status: 'active',
                  campaign_id: campaignId || null,
                  messages_from_user: 1,
                  messages_from_lead: 0,
                  last_message: personalizedMessage,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .select()
                .single();

              // Save message to database with spam score
              if (newThread) {
                const spamResult2 = detectSpam(personalizedMessage);
                await supabase
                  .from('messages')
                  .insert({
                    user_id: user.id,
                    thread_id: newThread.id,
                    from_phone: effectiveFrom,
                    to_phone: lead.phone,
                    body: personalizedMessage,
                    content: personalizedMessage,
                    direction: 'outbound',
                    status: 'sent',
                    channel: 'sms',
                    provider: 'telnyx',
                    message_sid: result.messageSid,
                    spam_score: spamResult2.spamScore,
                    spam_flags: spamResult2.detectedWords.map(w => w.word),
                    created_at: new Date().toISOString()
                  });
              }
            }
          } else {
            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: false,
              error: result.error || 'Send failed'
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

    // Update campaign stats after sending
    if (campaignId) {
      // Get current campaign data for merging
      const { data: currentCampaign } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (currentCampaign) {
        const currentLeadIds = Array.isArray(currentCampaign.lead_ids) ? currentCampaign.lead_ids : [];
        const currentTags = Array.isArray(currentCampaign.tags_applied) ? currentCampaign.tags_applied : [];

        await supabase
          .from('campaigns')
          .update({
            tags_applied: Array.from(new Set([...currentTags, ...addTags])),
            lead_ids: Array.from(new Set([...currentLeadIds, ...leadIds])),
            lead_count: Array.from(new Set([...currentLeadIds, ...leadIds])).length,
            messages_sent: (currentCampaign.messages_sent || 0) + sendResults.filter(r => r.success).length,
            credits_used: (currentCampaign.credits_used || 0) + totalCreditsUsed,
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignId);
      }
    }

    const successCount = sendResults.filter(r => r.success).length;
    const failCount = sendResults.filter(r => !r.success).length;
    const dncSkippedCount = sendResults.filter(r => !r.success && r.error?.startsWith('Skipped: On DNC')).length;

    return NextResponse.json({
      ok: true,
      campaignId,
      updated: targetLeads.length,
      smsSent: sendSMS,
      sendResults: {
        total: sendResults.length,
        success: successCount,
        failed: failCount,
        dncSkipped: dncSkippedCount,
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
