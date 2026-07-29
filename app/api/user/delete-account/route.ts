import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import Stripe from 'stripe';
import { notifyAdmins } from '@/lib/createNotification';

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Create service role client for database operations
    const adminClient = createServiceRoleClient();

    // LOW-8: Cancel Stripe subscription before deleting account so billing stops immediately
    try {
      const { data: userRow } = await adminClient
        .from('users')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

      if (userRow?.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
        const subscriptions = await stripe.subscriptions.list({
          customer: userRow.stripe_customer_id,
          status: 'active',
          limit: 10,
        });
        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id);
          console.log(`✅ Cancelled Stripe subscription ${sub.id} for user ${userId}`);
        }
      }
    } catch (stripeErr) {
      console.error('Error cancelling Stripe subscription during account deletion:', stripeErr);
      // Non-fatal — continue with account deletion
    }

    // Delete all user data using service role client (bypasses RLS)
    // Delete in order respecting foreign key constraints

    // 0. Release phone numbers back to pool and from Telnyx
    const { data: userNumbers } = await adminClient
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', userId);

    if (userNumbers && userNumbers.length > 0) {
      const apiKey = process.env.TELNYX_API_KEY;

      for (const num of userNumbers) {
        // Release from Telnyx API
        if (apiKey) {
          try {
            const listRes = await fetch(
              `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(num.phone_number)}`,
              { headers: { 'Authorization': `Bearer ${apiKey}` } }
            );
            const listData = await listRes.json();
            const telnyxId = listData.data?.[0]?.id;
            if (telnyxId) {
              await fetch(`https://api.telnyx.com/v2/phone_numbers/${telnyxId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${apiKey}` },
              });
            }
          } catch (e) {
            console.error('Error releasing number from Telnyx:', num.phone_number, e);
          }
        }

        // Mark pool numbers as available again
        await adminClient
          .from('number_pool')
          .update({ is_assigned: false, assigned_to_user_id: null, assigned_at: null })
          .eq('phone_number', num.phone_number);
      }

      // Delete from user_telnyx_numbers
      await adminClient
        .from('user_telnyx_numbers')
        .delete()
        .eq('user_id', userId);
    }

    /**
     * Account deletion (#87).
     *
     * Previously this deleted 6 tables out of the 54 that carry `user_id`, so a
     * deletion request left behind threads, clients, notes, AI flows, documents
     * and 30-odd other tables of personal data. It also returned
     * `success: true` unconditionally — including when the auth deletion failed,
     * which told the user their account was gone while their login still worked.
     *
     * 13 tables CASCADE from `public.users` and are removed automatically when
     * that row goes. The list below is everything that does NOT cascade, so it
     * would otherwise orphan. None of them has a blocking foreign key, so the
     * order here only matters for tables that reference each other — children
     * first.
     */
    /**
     * Tables this route deliberately does NOT purge.
     *
     * These used to have `ON DELETE CASCADE` to auth.users, so excluding them
     * here achieved nothing — the database destroyed them anyway. Fixed in #93:
     * the constraints are `ON DELETE SET NULL` now, so the rows survive with a
     * null owner, and `deleted_user_id` is stamped below to keep them
     * attributable.
     *
     * If you add a table here, check pg_constraint — NOT
     * information_schema.constraint_column_usage, which does not reliably
     * report cross-schema foreign keys and is why the CASCADEs were missed.
     */
    const RETAINED_TABLES = {
      // Opt-outs outlive the account by law. Losing these would let a future
      // account message someone who already opted out, and destroy the audit
      // trail proving they did.
      dnc_list: 'TCPA — opt-outs must survive account deletion',
      dnc_history: 'audit trail for opt-out enforcement',
      // Financial records have their own retention requirements.
      payments: 'financial record',
      transactions: 'financial record',
    } as const;

    const PURGE_TABLES = [
      // — children first, where one references another —
      'ai_drip_messages', 'flow_completion_log', 'lead_activities', 'lead_notes',
      'drip_campaign_enrollments', 'receptionist_logs', 'sending_history',
      'sms_responses', 'conversation_sessions', 'service_emails',
      'referral_rewards', 'scraper_runs', 'scraped_data', 'conversation_tags',
      // — parents —
      'ai_drips', 'drip_campaigns', 'scheduled_messages', 'scheduled_campaigns',
      'follow_ups', 'threads', 'clients', 'conversation_flows', 'flows',
      'tags', 'tag_groups', 'message_templates', 'sms_templates', 'sms_messages',
      'auto_tagging_rules', 'notifications', 'referral_codes', 'scraper_configs',
      'receptionist_settings', 'user_preferences', 'user_settings',
      'user_10dlc_registrations', 'porting_orders', 'lead_flows',
      // — cascade from users anyway, but deleted explicitly so a future FK
      //   change can't silently start orphaning them —
      'points_transactions', 'credit_transactions', 'point_pack_purchases',
      'messages', 'leads', 'campaigns', 'calendar_events', 'documents', 'emails',
    ];

    const failures: { table: string; error: string }[] = [];

    for (const table of PURGE_TABLES) {
      // supabase-js resolves with { error } rather than throwing, so an
      // unchecked delete is indistinguishable from a successful one — which is
      // how this route came to report success while doing almost nothing.
      const { error } = await adminClient.from(table).delete().eq('user_id', userId);
      if (error) {
        console.error(`Account deletion: failed to purge ${table} for ${userId}:`, error);
        failures.push({ table, error: error.message });
      }
    }

    // 2. Delete the profile row. 13 tables cascade off this.
    const { error: userError } = await adminClient
      .from('users')
      .delete()
      .eq('id', userId);

    if (userError) {
      console.error('Error deleting user profile:', userError);
      failures.push({ table: 'users', error: userError.message });
    }

    /**
     * 3. Preserve the records that outlive the account (#93).
     *
     * These four tables are excluded from the purge above, but that alone was
     * never enough — they had ON DELETE CASCADE to auth.users, so the database
     * removed them regardless. The constraints are SET NULL now, which keeps
     * the rows but nulls user_id, so provenance is captured here first.
     *
     * Must happen BEFORE the auth delete: once user_id is nulled there is
     * nothing left to copy.
     */
    for (const table of Object.keys(RETAINED_TABLES)) {
      const { error } = await adminClient
        .from(table)
        .update({ deleted_user_id: userId })
        .eq('user_id', userId);
      if (error) {
        console.error(`Account deletion: could not stamp deleted_user_id on ${table} for ${userId}:`, error);
        failures.push({ table: `${table} (provenance)`, error: error.message });
      }
    }

    /**
     * Keep this account's opt-outs ENFORCED, not merely retained.
     *
     * check_dnc() matches `dnc_list WHERE user_id = p_user_id` or the global
     * list. Once user_id is nulled, a retained row matches neither — the record
     * survives while enforcement silently stops, which is worse than losing it,
     * because the row looks like protection.
     *
     * Promoting to dnc_global keeps those numbers blocked. This platform shares
     * a number pool and reassigns numbers between tenants (#38), so a consumer
     * who texted STOP to a pool number opted out of a number that will be
     * reused. Over-blocking is the safe direction.
     */
    const { data: promotedCount, error: promoteError } = await adminClient
      .rpc('promote_user_dnc_to_global', { p_user_id: userId });

    if (promoteError) {
      // Loud: this is the difference between an opt-out surviving and not.
      console.error(`❌ Account deletion: could not promote DNC entries to global for ${userId}:`, promoteError);
      await notifyAdmins(
        'fulfillment_failed',
        'URGENT: deleted account\'s opt-outs may no longer be enforced',
        `${userId} (${user.email}) was deleted but their DNC entries could not be promoted to the global list. Numbers they had opted out could now be messaged again. Promote them by hand.`,
        { reason: 'dnc_promotion_failed', user_id: userId, email: user.email, db_error: promoteError.message }
      );
      failures.push({ table: 'dnc_global (promotion)', error: promoteError.message });
    } else if (promotedCount) {
      console.log(`🔒 Promoted ${promotedCount} DNC entr${promotedCount === 1 ? 'y' : 'ies'} to the global list for deleted account ${userId}`);
    }

    // 4. Delete the auth record LAST — public.users references it, so removing
    //    the profile first is what lets this succeed.
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      // This is the one failure that must never be reported as success: the
      // user can still sign in. Surface it rather than claiming the account
      // was deleted.
      console.error('Error deleting auth user:', deleteAuthError);
      await notifyAdmins(
        'fulfillment_failed',
        'URGENT: account deletion failed — the login still works',
        `${userId} (${user.email}) requested account deletion. Their data was purged but the auth record could not be deleted, so they can still sign in. Remove it manually.`,
        { reason: 'account_deletion_auth_failed', user_id: userId, email: user.email, purge_failures: failures, db_error: deleteAuthError.message }
      );
      return NextResponse.json(
        {
          error: 'We could not fully delete your account. Your data has been removed but the login record remains — support has been notified and will complete the deletion.',
          partial: true,
        },
        { status: 500 }
      );
    }

    if (failures.length > 0) {
      // Auth is gone so the user cannot get back in, but data was left behind.
      console.error(`Account deletion for ${userId} completed with ${failures.length} table(s) not purged:`, failures);
      await notifyAdmins(
        'fulfillment_failed',
        'Account deleted but some data could not be purged',
        `${userId} was deleted, but ${failures.length} table(s) failed to purge: ${failures.map((f) => f.table).join(', ')}. Clean up manually.`,
        { reason: 'account_deletion_partial', user_id: userId, failures }
      );
    }

    console.log(
      `✅ Account ${userId} deleted — ${PURGE_TABLES.length - failures.length}/${PURGE_TABLES.length} tables purged. ` +
      `Retained: ${Object.keys(RETAINED_TABLES).join(', ')}.`
    );

    // Sign out the user
    await supabase.auth.signOut();

    return NextResponse.json(
      {
        success: true,
        message: "Account successfully deleted"
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete account" },
      { status: 500 }
    );
  }
}
