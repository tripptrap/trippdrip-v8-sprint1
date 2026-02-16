import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // Check if current user is admin
    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();

    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, userId, userEmail, duration, reason, credits, grantReason } = await req.json();

    if (!action || !userId) {
      return NextResponse.json({ error: 'action and userId required' }, { status: 400 });
    }

    // Prevent admin from acting on themselves
    if (userId === user.id) {
      return NextResponse.json({ error: 'Cannot perform this action on your own account' }, { status: 400 });
    }

    // Protect admin accounts from ban/suspend/delete
    if (userEmail && isAdminEmail(userEmail)) {
      return NextResponse.json({ error: 'Cannot suspend, ban, or delete an admin account' }, { status: 403 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    switch (action) {
      case 'suspend': {
        // Suspend: disable auth user for a duration
        // duration is in hours; default to indefinite (~100 years)
        const banHours = duration ? String(duration) + 'h' : '876000h';
        const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: banHours,
        });
        if (banError) {
          console.error('Error suspending user:', banError);
          return NextResponse.json({ error: banError.message }, { status: 500 });
        }

        // Calculate suspended_until
        let suspendedUntil: string | null = null;
        if (duration) {
          const until = new Date();
          until.setHours(until.getHours() + Number(duration));
          suspendedUntil = until.toISOString();
        }

        // Update users table account_status, reason, and suspended_until
        {
          const updateData = {
            account_status: 'suspended',
            suspension_reason: reason || 'Violation of terms of service',
            suspended_until: suspendedUntil,
            updated_at: new Date().toISOString(),
          };
          // Try by email first, then by id
          const { count } = await adminClient.from('users').update(updateData).eq('email', (userEmail || '').toLowerCase());
          if (!count || count === 0) {
            await adminClient.from('users').update(updateData).eq('id', userId);
          }
        }

        if (userEmail) {
          // Send notification email
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
            await fetch(`${baseUrl}/api/email/service`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.SYSTEM_API_KEY || '',
              },
              body: JSON.stringify({
                type: 'account_suspended',
                to: userEmail,
                data: {
                  userName: 'there',
                  reason: reason || 'Violation of terms of service',
                  suspendedUntil,
                },
              }),
            });
          } catch (emailErr) {
            console.error('Failed to send suspension email:', emailErr);
          }
        }

        const durationLabel = duration ? `${duration}h` : 'indefinitely';
        return NextResponse.json({ ok: true, message: `User suspended for ${durationLabel}` });
      }

      case 'unsuspend': {
        // Unsuspend: remove ban
        const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: 'none',
        });
        if (unbanError) {
          console.error('Error unsuspending user:', unbanError);
          return NextResponse.json({ error: unbanError.message }, { status: 500 });
        }

        {
          const updateData = {
            account_status: 'active',
            suspension_reason: null,
            suspended_until: null,
            updated_at: new Date().toISOString(),
          };
          const { count } = await adminClient.from('users').update(updateData).eq('email', (userEmail || '').toLowerCase());
          if (!count || count === 0) {
            await adminClient.from('users').update(updateData).eq('id', userId);
          }
        }

        return NextResponse.json({ ok: true, message: 'User unsuspended' });
      }

      case 'ban': {
        // Ban: permanently disable + mark banned
        const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: '876000h',
        });
        if (banError) {
          console.error('Error banning user:', banError);
          return NextResponse.json({ error: banError.message }, { status: 500 });
        }

        {
          const updateData = {
            account_status: 'banned',
            suspension_reason: reason || 'Violation of terms of service',
            suspended_until: null,
            updated_at: new Date().toISOString(),
          };
          const { count } = await adminClient.from('users').update(updateData).eq('email', (userEmail || '').toLowerCase());
          if (!count || count === 0) {
            await adminClient.from('users').update(updateData).eq('id', userId);
          }
        }

        if (userEmail) {
          // Send notification email
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
            await fetch(`${baseUrl}/api/email/service`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.SYSTEM_API_KEY || '',
              },
              body: JSON.stringify({
                type: 'account_banned',
                to: userEmail,
                data: {
                  userName: 'there',
                  reason: reason || 'Violation of terms of service',
                },
              }),
            });
          } catch (emailErr) {
            console.error('Failed to send ban email:', emailErr);
          }
        }

        return NextResponse.json({ ok: true, message: 'User banned' });
      }

      case 'unban': {
        // Unban: remove ban + restore active
        const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: 'none',
        });
        if (unbanError) {
          console.error('Error unbanning user:', unbanError);
          return NextResponse.json({ error: unbanError.message }, { status: 500 });
        }

        {
          const updateData = {
            account_status: 'active',
            suspension_reason: null,
            suspended_until: null,
            updated_at: new Date().toISOString(),
          };
          const { count } = await adminClient.from('users').update(updateData).eq('email', (userEmail || '').toLowerCase());
          if (!count || count === 0) {
            await adminClient.from('users').update(updateData).eq('id', userId);
          }
        }

        return NextResponse.json({ ok: true, message: 'User unbanned' });
      }

      case 'delete': {
        // Delete: remove auth user entirely
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
        if (deleteError) {
          console.error('Error deleting user:', deleteError);
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        // Clean up users table row — try email first, then id
        {
          const { count } = await adminClient.from('users').delete().eq('email', (userEmail || '').toLowerCase());
          if (!count || count === 0) {
            await adminClient.from('users').delete().eq('id', userId);
          }
        }

        return NextResponse.json({ ok: true, message: 'User deleted' });
      }

      case 'grant_credits': {
        const creditAmount = Number(credits) || 0;

        if (creditAmount <= 0 || creditAmount > 1000000) {
          return NextResponse.json({ error: 'Invalid credit amount (must be 1-1,000,000)' }, { status: 400 });
        }

        // Get current user credits
        let currentCredits = 0;
        const { data: userData } = await adminClient
          .from('users')
          .select('credits')
          .eq('email', (userEmail || '').toLowerCase())
          .single();

        if (userData) {
          currentCredits = userData.credits || 0;
        }

        const newCredits = currentCredits + creditAmount;

        // Update credits in users table
        const { error: updateError } = await adminClient
          .from('users')
          .update({
            credits: newCredits,
            updated_at: new Date().toISOString(),
          })
          .eq('email', (userEmail || '').toLowerCase());

        if (updateError) {
          console.error('Error granting credits:', updateError);
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Log the transaction
        await adminClient.from('points_transactions').insert({
          user_id: userId,
          points_amount: creditAmount,
          action_type: 'admin_grant',
          description: grantReason || `Admin granted ${creditAmount.toLocaleString()} credits`,
          balance_after: newCredits,
          created_at: new Date().toISOString(),
        });

        // Send notification email
        if (userEmail) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hyvewyre.com';
            await fetch(`${baseUrl}/api/email/service`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.SYSTEM_API_KEY || '',
              },
              body: JSON.stringify({
                type: 'credits_granted',
                to: userEmail,
                data: {
                  userName: 'there',
                  credits: creditAmount.toLocaleString(),
                  reason: grantReason || 'Admin credit grant',
                  newBalance: newCredits.toLocaleString(),
                },
              }),
            });
          } catch (emailErr) {
            console.error('Failed to send credits granted email:', emailErr);
          }
        }

        return NextResponse.json({
          ok: true,
          message: `Granted ${creditAmount.toLocaleString()} credits to user`,
          newBalance: newCredits,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Admin action error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
