// Find-or-create the conversation thread an outbound message belongs to.
//
// Why (#59): four send paths each grew their own copy of this, and
// cron/process-scheduled — the one that sends scheduled messages — simply never
// got it. Scheduled sends therefore inserted a `messages` row with no
// thread_id, so the message reached the lead but never appeared in the
// conversation view, and the thread's counters and preview went stale.
//
// That stayed invisible because the same insert was also failing on wrong
// column names (#53); fixing those made the missing thread_id the next problem.
//
// Threads are matched by phone number first and lead_id second, mirroring
// app/api/telnyx/send-sms/route.ts, which is the most complete existing
// implementation. Kept deliberately small — the other three paths already work
// and aren't worth the regression risk of switching them right now, but new
// send paths should use this rather than writing a fifth copy.

import type { SupabaseClient } from '@supabase/supabase-js';

interface AttachArgs {
  userId: string;
  /** Recipient phone, E.164. Primary match key. */
  phone: string;
  leadId?: string | null;
  campaignId?: string | null;
  /** Message body, stored as the thread preview. */
  lastMessage: string;
}

/**
 * Returns the thread id for this outbound message, creating the thread if
 * needed, and bumps the outbound counter and preview.
 *
 * Returns null (and logs) on failure — the caller has usually already sent the
 * SMS by this point, so a thread problem must not throw away that fact.
 */
export async function attachToThread(
  supabase: SupabaseClient,
  { userId, phone, leadId, campaignId, lastMessage }: AttachArgs
): Promise<string | null> {
  try {
    let existing: any = null;

    const { data: byPhone } = await supabase
      .from('threads')
      .select('id, messages_from_user, campaign_id')
      .eq('user_id', userId)
      .eq('phone_number', phone)
      .maybeSingle();

    if (byPhone) {
      existing = byPhone;
    } else if (leadId) {
      const { data: byLead } = await supabase
        .from('threads')
        .select('id, messages_from_user, campaign_id')
        .eq('user_id', userId)
        .eq('lead_id', leadId)
        .maybeSingle();

      if (byLead) {
        existing = byLead;
        // Backfill the phone number so the next lookup matches on it directly.
        await supabase.from('threads').update({ phone_number: phone }).eq('id', byLead.id);
      }
    }

    const now = new Date().toISOString();

    if (existing) {
      // NOTE: threads has `last_message` and `updated_at`, but NOT
      // `last_message_at` — CLAUDE.md documents that column, the live table
      // doesn't have it. Verified against information_schema 2026-07-28.
      // `last_message_snippet` and `last_sender` are the other real columns
      // here if a richer preview is ever wanted.
      const update: Record<string, unknown> = {
        last_message: lastMessage,
        last_message_snippet: lastMessage.slice(0, 140),
        last_sender: 'user',
        updated_at: now,
        messages_from_user: (existing.messages_from_user || 0) + 1,
      };
      if (campaignId && !existing.campaign_id) update.campaign_id = campaignId;

      const { error } = await supabase.from('threads').update(update).eq('id', existing.id);
      if (error) console.error(`Failed to update thread ${existing.id}:`, error);
      return existing.id;
    }

    const { data: created, error: insertError } = await supabase
      .from('threads')
      .insert({
        user_id: userId,
        phone_number: phone,
        lead_id: leadId || null,
        campaign_id: campaignId || null,
        channel: 'sms',
        status: 'active',
        last_message: lastMessage,
        last_message_snippet: lastMessage.slice(0, 140),
        last_sender: 'user',
        messages_from_user: 1,
        messages_from_lead: 0,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`Failed to create thread for ${phone} (user ${userId}):`, insertError);
      return null;
    }
    return created?.id ?? null;
  } catch (err) {
    console.error(`attachToThread failed for ${phone} (user ${userId}):`, err);
    return null;
  }
}
