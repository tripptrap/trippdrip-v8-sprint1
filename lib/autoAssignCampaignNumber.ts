import { createClient } from '@supabase/supabase-js';
import { assignNumberToCampaign } from '@/lib/telnyx10dlc';
import { isTollFreeNumber } from '@/lib/telnyx';
import { alertAdminsThrottled } from '@/lib/alerting';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * Attach a number to its owner's 10DLC campaign, automatically (#107).
 *
 * A number that is not on the user's campaign cannot send A2P traffic — carriers
 * filter it. Assignment used to be a button in Settings that someone had to know
 * to press, so a user could buy a number, see it listed as theirs, and have every
 * message silently filtered.
 *
 * Called from both directions, because either can happen first:
 *   - a number is bought after the campaign is approved  → assign it now
 *   - the campaign is approved after numbers were bought → assign them then
 *
 * **Never throws and never blocks the caller.** Every call site is finishing
 * something the user already paid for; failing a purchase because a carrier
 * mapping did not take would be the wrong trade. Failures alert instead.
 *
 * Note `assignNumberToCampaign` resolves as soon as Telnyx accepts the request.
 * That means *submitted*, not *assigned* — the mapping goes PENDING and can
 * still end in FAILED_ASSIGNMENT hours later (#105). Treat a success here as
 * "handed to Telnyx", and rely on the campaign status refresh for the outcome.
 */
export async function autoAssignNumberToCampaign(
  userId: string,
  phoneNumber: string
): Promise<{ attempted: boolean; submitted: boolean; reason?: string }> {
  if (!supabaseAdmin) {
    console.error('autoAssignNumberToCampaign: no service-role client');
    return { attempted: false, submitted: false, reason: 'no service-role client' };
  }

  // Toll-free numbers are verified through TFV, not 10DLC — they have no place
  // on a campaign, and the pool hands them out for exactly that reason.
  if (isTollFreeNumber(phoneNumber)) {
    return { attempted: false, submitted: false, reason: 'toll-free uses TFV, not 10DLC' };
  }

  try {
    const { data: reg, error } = await supabaseAdmin
      .from('user_10dlc_registrations')
      .select('id, campaign_id, campaign_status, assigned_phone_number')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error(`autoAssignNumberToCampaign: could not read registration for ${userId}:`, error);
      return { attempted: false, submitted: false, reason: error.message };
    }

    // No campaign yet is the normal case for most users — not a problem, and
    // not worth logging as one. The number gets picked up when the campaign is
    // approved, from the other call site.
    if (!reg?.campaign_id) {
      return { attempted: false, submitted: false, reason: 'no campaign registered' };
    }

    const status = (reg.campaign_status || '').toLowerCase();
    if (status && !['active', 'approved', 'mno_provisioned'].includes(status)) {
      return { attempted: false, submitted: false, reason: `campaign not approved (${status})` };
    }

    const result = await assignNumberToCampaign(phoneNumber, reg.campaign_id);

    if (!result.success) {
      // Not fatal to the caller — the user has their number, it just cannot
      // send A2P until this is sorted, which only an operator can do.
      console.error(`❌ Could not assign ${phoneNumber} to campaign ${reg.campaign_id}: ${result.error}`);
      await alertAdminsThrottled({
        key: `campaign_assign_failed:${reg.campaign_id}`,
        title: 'A number could not be attached to its 10DLC campaign',
        body: `${phoneNumber} was bought by ${userId} but could not be assigned to campaign ${reg.campaign_id}: ${result.error}. Until it is attached, A2P messages from that number are filtered by carriers.`,
        data: { phone_number: phoneNumber, user_id: userId, campaign_id: reg.campaign_id, error: result.error },
        windowMinutes: 240,
      });
      return { attempted: true, submitted: false, reason: result.error };
    }

    console.log(`📇 Submitted ${phoneNumber} for assignment to campaign ${reg.campaign_id}`);

    // Record the first number against the registration so the UI can show one.
    // Only when empty — this column holds the campaign's headline number, not a
    // list, and a campaign can carry many.
    if (!reg.assigned_phone_number) {
      const { error: updateError } = await supabaseAdmin
        .from('user_10dlc_registrations')
        .update({ assigned_phone_number: phoneNumber, updated_at: new Date().toISOString() })
        .eq('id', reg.id);
      if (updateError) {
        console.error(`autoAssignNumberToCampaign: assigned ${phoneNumber} but could not record it:`, updateError);
      }
    }

    return { attempted: true, submitted: true };
  } catch (err: any) {
    console.error('autoAssignNumberToCampaign threw:', err?.message || err);
    return { attempted: false, submitted: false, reason: err?.message };
  }
}

/**
 * Assign every number a user owns to their campaign. Used when the campaign
 * becomes approved after the numbers were already bought.
 */
export async function assignAllUserNumbersToCampaign(userId: string): Promise<number> {
  if (!supabaseAdmin) return 0;

  const { data: numbers, error } = await supabaseAdmin
    .from('user_telnyx_numbers')
    .select('phone_number')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !numbers?.length) return 0;

  let submitted = 0;
  for (const n of numbers) {
    const r = await autoAssignNumberToCampaign(userId, n.phone_number);
    if (r.submitted) submitted++;
  }
  return submitted;
}
