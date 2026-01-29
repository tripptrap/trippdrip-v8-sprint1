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

    const { action, userId, userEmail, duration } = await req.json();

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

        // Update users table account_status
        if (userEmail) {
          await adminClient
            .from('users')
            .update({ account_status: 'suspended', updated_at: new Date().toISOString() })
            .eq('email', userEmail.toLowerCase());
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

        if (userEmail) {
          await adminClient
            .from('users')
            .update({ account_status: 'active', updated_at: new Date().toISOString() })
            .eq('email', userEmail.toLowerCase());
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

        if (userEmail) {
          await adminClient
            .from('users')
            .update({ account_status: 'banned', updated_at: new Date().toISOString() })
            .eq('email', userEmail.toLowerCase());
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

        if (userEmail) {
          await adminClient
            .from('users')
            .update({ account_status: 'active', updated_at: new Date().toISOString() })
            .eq('email', userEmail.toLowerCase());
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

        // Clean up users table row
        if (userEmail) {
          await adminClient
            .from('users')
            .delete()
            .eq('email', userEmail.toLowerCase());
        }

        return NextResponse.json({ ok: true, message: 'User deleted' });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Admin action error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
