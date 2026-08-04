import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { calculateSMSCredits } from "@/lib/creditCalculator";
import { resolveFromNumber } from "@/lib/resolveFromNumber";
import { loadModerationPolicy, moderateWithPolicy } from "@/lib/smsModeration";
import { sendTelnyxSMS } from "@/lib/telnyx";
import { createNotification } from "@/lib/createNotification";
import { checkSmsAllowed } from "@/lib/smsGuard";
import { isFirstContact, appendOptOut } from '@/lib/optOutFooter';

// Credit changes run on the service-role client, never the caller's (#114).
//
// add_credits and deduct_credits are SECURITY DEFINER and were granted to
// `authenticated`. Their guard only stops you acting on ANOTHER user — acting on
// your own id was permitted, so any logged-in user could POST
// /rest/v1/rpc/add_credits with their own id and mint credits. Verified: a test
// account went 0 -> 999,999 in one request. Credits are what the point packs
// sell, so that was revenue, not just data.
//
// EXECUTE is revoked from authenticated; these calls run as service_role. The
// user id still comes from the verified session.

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

    // CRIT-5: Fetch credits server-side — never trust client-supplied userPoints
    const { data: userCreditsRow } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();
    const userPoints: number = userCreditsRow?.credits ?? 0;

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
          tags: addTags,
          lead_ids: leadIds,
          total_leads: leadIds.length,
          messages_sent: 0,
          credits_used: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      campaignId = newCampaign ? String(newCampaign.id) : '';
    }

    // Fetch user's settings (opt-out keyword + spam protection)
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('opt_out_keyword, spam_protection')
      .eq('user_id', user.id)
      .single();
    const optOutKeyword = userSettings?.opt_out_keyword || null;
    // MERGED onto the defaults, not replaced by the stored object (#128).
    //
    // `userSettings?.spam_protection || { …defaults }` takes the stored value
    // wholesale when one exists. Live rows hold only four of the eleven keys —
    // the column default — so every advanced limit here evaluated to `undefined`
    // at runtime, and `undefined > cap` is false: the batch and campaign caps
    // silently permitted everything for every real account.
    //
    // `telnyx/send-sms` and `lib/smsGuard` both merge. This route was the one
    // that did not.
    const SPAM_DEFAULTS = {
      enabled: true,
      blockOnHighRisk: true,
      maxHourlyMessages: 100,
      maxDailyMessages: 1000,
      maxMessagesPerMinute: 10,
      maxMessagesPerContact: 5,
      cooldownMinutes: 30,
      maxCampaignMessagesPerHour: 200,
      maxBulkRecipients: 500,
      enableWeekendLimits: false,
      weekendLimitPercent: 50
    };
    const spamProtection = { ...SPAM_DEFAULTS, ...(userSettings?.spam_protection || {}) };

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

      // Content moderation (#123). Two levels, both needed:
      //
      //   here          the raw template, so a spammy campaign is rejected once,
      //                 before any lead is messaged or any credit spent.
      //   per lead      the personalized text that actually goes on the wire.
      //                 A clean template can still produce a flagged message
      //                 once lead data is substituted in, and until now only the
      //                 template was ever checked.
      //
      // The policy is read once here and reused for every lead — this loop runs
      // up to `maxBulkRecipients` times and does not need that many identical
      // settings queries.
      const moderationPolicy = await loadModerationPolicy(supabase, user.id);
      const templateModeration = moderateWithPolicy(moderationPolicy, messageTemplate);
      if (!templateModeration.allowed) {
        return NextResponse.json({
          ok: false,
          error: templateModeration.detail,
          spamRisk: true,
          spamScore: templateModeration.spamScore,
          detectedWords: templateModeration.flags,
          suggestions: templateModeration.suggestions
        }, { status: 400 });
      }

      // Check rate limits
      if (spamProtection.enabled) {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const newMessageCount = targetLeads.length;

        // Check bulk recipients limit
        const maxBulk = spamProtection.maxBulkRecipients || 500;
        if (newMessageCount > maxBulk) {
          return NextResponse.json({
            ok: false,
            error: `Bulk limit exceeded: Maximum ${maxBulk} recipients per send. You're trying to send to ${newMessageCount}. Please reduce your selection or increase the limit in Settings.`,
            rateLimited: true,
            maxBulkRecipients: maxBulk,
            attempted: newMessageCount
          }, { status: 429 });
        }

        // Calculate effective limits (apply weekend reduction if enabled)
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const weekendMultiplier = (spamProtection.enableWeekendLimits && isWeekend)
          ? (spamProtection.weekendLimitPercent || 50) / 100
          : 1;

        const effectiveHourlyLimit = Math.round(spamProtection.maxHourlyMessages * weekendMultiplier);
        const effectiveDailyLimit = Math.round(spamProtection.maxDailyMessages * weekendMultiplier);
        const effectiveCampaignHourlyLimit = Math.round((spamProtection.maxCampaignMessagesPerHour || 200) * weekendMultiplier);

        // Count messages sent in last hour
        const { count: hourlyCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('direction', 'outbound')
          .gte('created_at', oneHourAgo.toISOString());

        // Count messages sent in last 24 hours
        const { count: dailyCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('direction', 'outbound')
          .gte('created_at', oneDayAgo.toISOString());

        const currentHourly = hourlyCount || 0;
        const currentDaily = dailyCount || 0;

        // Check hourly limit
        if (currentHourly + newMessageCount > effectiveHourlyLimit) {
          return NextResponse.json({
            ok: false,
            error: `Rate limit exceeded: You can send ${effectiveHourlyLimit} messages per hour${isWeekend && spamProtection.enableWeekendLimits ? ' (weekend limit)' : ''}. Currently sent: ${currentHourly}. Trying to send: ${newMessageCount}. Please wait or reduce batch size.`,
            rateLimited: true,
            currentHourly,
            maxHourly: effectiveHourlyLimit,
            availableThisHour: Math.max(0, effectiveHourlyLimit - currentHourly),
            isWeekendLimit: isWeekend && spamProtection.enableWeekendLimits
          }, { status: 429 });
        }

        // Check daily limit
        if (currentDaily + newMessageCount > effectiveDailyLimit) {
          return NextResponse.json({
            ok: false,
            error: `Rate limit exceeded: You can send ${effectiveDailyLimit} messages per day${isWeekend && spamProtection.enableWeekendLimits ? ' (weekend limit)' : ''}. Currently sent: ${currentDaily}. Trying to send: ${newMessageCount}. Please wait until tomorrow or increase your daily limit in Settings.`,
            rateLimited: true,
            currentDaily,
            maxDaily: effectiveDailyLimit,
            availableToday: Math.max(0, effectiveDailyLimit - currentDaily),
            isWeekendLimit: isWeekend && spamProtection.enableWeekendLimits
          }, { status: 429 });
        }

        // Check campaign-specific hourly limit
        if (newMessageCount > effectiveCampaignHourlyLimit) {
          return NextResponse.json({
            ok: false,
            error: `Campaign limit exceeded: Maximum ${effectiveCampaignHourlyLimit} messages per campaign per hour${isWeekend && spamProtection.enableWeekendLimits ? ' (weekend limit)' : ''}. You're trying to send ${newMessageCount}. Please reduce batch size or split into multiple sends.`,
            rateLimited: true,
            maxCampaignHourly: effectiveCampaignHourlyLimit,
            attempted: newMessageCount
          }, { status: 429 });
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

        // Single gate for opt-out and quiet hours (#40, #50). This path had no
        // quiet-hours check at all before, despite being the bulk sender — a
        // campaign fired at 2am sent at 2am. Gates on the *lead's* local time
        // where their state is known, which is what TCPA keys on.
        const guard = await checkSmsAllowed(createServiceRoleClient(), user.id, lead.phone, {
          enforceQuietHours: true,
          recipientState: lead.state,
          context: { campaign_id: campaignId, campaign_name: campaignName, source: 'campaign' },
        });

        if (!guard.allowed) {
          console.log(`Campaign skip — ${lead.phone}: ${guard.reason} (${guard.detail})`);
          sendResults.push({
            leadId: String(lead.id),
            phone: lead.phone,
            success: false,
            error: guard.retryable
              ? `Deferred: ${guard.detail}`
              : `Skipped: ${guard.detail}`,
          });
          dncSkipped++;
          continue;
        }

        // Personalize message
        const personalizedMessage = personalizeMessage(messageTemplate, lead);

        // Send via Telnyx API
        try {
          // Geo-route: pick closest number to lead's zip code
          //
          // A failure here used to fall through to a `fromNumber` read straight
          // from the request body with no ownership check, and then to '', which
          // sendTelnyxSMS turned into a profile-pool send from a number nobody
          // chose (#125). That body field is now gone entirely (#127): this
          // route geo-routes per lead, so letting the caller name a number was
          // never a feature — only an unvalidated way to override the routing.
          // Now a failure is recorded against this lead and the run continues.
          const resolved = await resolveFromNumber(createServiceRoleClient(), user.id, { leadZipCode: lead.zip_code || null, toPhone: lead.phone });
          if (!resolved.ok) {
            console.error(`Campaign: no sending number for ${lead.phone} — ${resolved.reason}`);
            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: false,
              error: resolved.detail,
            });
            continue;
          }
          const effectiveFrom = resolved.number;

          // Opt-out footer on a first contact, through the shared helper — one
          // definition of "first", rather than a third hand-rolled copy of it.
          //
          // isFirstContact + appendOptOut rather than withOptOutFooterIfFirst:
          // the keyword is fetched once for the whole campaign above, and the
          // helper is split exactly so a batch can reuse it instead of querying
          // settings per recipient.
          const messageToSend = (await isFirstContact(supabase, user.id, lead.phone))
            ? appendOptOut(personalizedMessage, optOutKeyword || 'STOP')
            : personalizedMessage;

          // Scores `personalizedMessage`, not `messageToSend` — the difference
          // is our own opt-out footer, and flagging text we appended would be
          // both wrong and unactionable.
          const moderation = moderateWithPolicy(moderationPolicy, personalizedMessage);
          if (!moderation.allowed) {
            console.log(`Campaign: blocked message to ${lead.phone} — score ${moderation.spamScore}`);
            sendResults.push({
              leadId: String(lead.id),
              phone: lead.phone,
              success: false,
              error: moderation.detail,
            });
            continue;
          }

          const result = await sendTelnyxSMS({
            to: lead.phone,
            message: messageToSend,
            from: effectiveFrom,
            moderation,
          });

          if (result.success) {
            // Calculate credits for this specific personalized message
            const personalizedCreditCalc = calculateSMSCredits(personalizedMessage, 0);
            const messageCredits = personalizedCreditCalc.credits;

            // CRIT-5: Deduct credits server-side after each successful send
            const { error: deductError } = await createServiceRoleClient().rpc('deduct_credits', { user_id: user.id, amount: messageCredits });
            if (deductError) {
              // Already sent — can't be rolled back, so make it visible (#90).
              console.error(`❌ Campaign message sent to lead ${lead.id} but ${messageCredits} credits NOT deducted for user ${user.id}:`, deductError);
            }

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

              // Checked, not fire-and-forget. supabase-js returns { error }
              // rather than throwing, so an unchecked insert fails in total
              // silence — and a campaign send that records no row is one the
              // rate limit and number health cannot see (#126).
              const { error: msgInsertError } = await supabase
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
                  spam_score: moderation.spamScore,
                  spam_flags: moderation.flags,
                  created_at: new Date().toISOString()
                });

              if (msgInsertError) {
                console.error(`❌ Campaign sent to ${lead.phone} but failed to record it:`, msgInsertError);
              }
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
                // Checked, for the same reason as the existing-thread branch
                // above — an unchecked insert fails silently and the send goes
                // uncounted (#126).
                const { error: newThreadMsgError } = await supabase
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
                    spam_score: moderation.spamScore,
                    spam_flags: moderation.flags,
                    created_at: new Date().toISOString()
                  });

                if (newThreadMsgError) {
                  console.error(`❌ Campaign sent to ${lead.phone} but failed to record it:`, newThreadMsgError);
                }
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

    // Tag leads (always happens). Counted rather than fire-and-forget: the
    // campaign reports what it did, and silently tagging nothing would make
    // that report wrong (#115).
    let taggedCount = 0;
    for (const lead of targetLeads) {
      const currentTags = Array.isArray(lead.tags) ? lead.tags : [];
      const mergedTags = Array.from(new Set([...currentTags, ...addTags]));

      const { data: tagged, error: tagError } = await supabase
        .from('leads')
        .update({
          tags: mergedTags,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id)
        .eq('user_id', user.id)
        .select('id');
      if (tagError || !tagged?.length) {
        console.error(`Campaign tagging missed lead ${lead.id}:`, tagError?.message ?? 'no rows matched');
      } else {
        taggedCount++;
      }
    }
    if (taggedCount !== targetLeads.length) {
      console.error(`Campaign tagged ${taggedCount}/${targetLeads.length} leads`);
    }

    // Update campaign stats after sending
    let campaignLabel = 'Your campaign';
    if (campaignId) {
      // Get current campaign data for merging
      const { data: currentCampaign } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (currentCampaign) {
        campaignLabel = currentCampaign.name || 'Your campaign';
        const currentLeadIds = Array.isArray(currentCampaign.lead_ids) ? currentCampaign.lead_ids : [];
        const currentTags = Array.isArray(currentCampaign.tags) ? currentCampaign.tags : [];

        await supabase
          .from('campaigns')
          .update({
            tags: Array.from(new Set([...currentTags, ...addTags])),
            lead_ids: Array.from(new Set([...currentLeadIds, ...leadIds])),
            total_leads: Array.from(new Set([...currentLeadIds, ...leadIds])).length,
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

    // Fire campaign_done in-app notification if any messages were sent
    if (successCount > 0) {
      createNotification(
        user.id,
        'campaign_done',
        `${campaignLabel} finished sending`,
        `${successCount} message${successCount !== 1 ? 's' : ''} sent${failCount > 0 ? `, ${failCount} failed` : ''}.`,
        { campaignId, successCount, failCount }
      ).catch(() => {});
    }

    // Fire low_credits notification if balance crossed below threshold during this run
    if (sendSMS && totalCreditsUsed > 0) {
      const LOW_CREDITS_THRESHOLD = 500;
      if (userPoints >= LOW_CREDITS_THRESHOLD) {
        const remainingCredits = userPoints - totalCreditsUsed;
        if (remainingCredits < LOW_CREDITS_THRESHOLD) {
          createNotification(
            user.id,
            'low_credits',
            'Running low on credits',
            `You have ${Math.max(0, remainingCredits).toLocaleString()} credits remaining. Top up to keep SMS features running.`,
            { remainingCredits: Math.max(0, remainingCredits) }
          ).catch(() => {});
        }
      }
    }

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
