import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    // Check if current user is admin
    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();

    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role client to access auth.users
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });

    if (authError) {
      console.error('Error fetching users:', authError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Get user plans from user_plans table
    const { data: userPlans } = await adminClient
      .from('user_plans')
      .select('user_id, plan_type, points_balance, created_at, updated_at');

    // Get message counts per user
    const { data: messageCounts } = await adminClient
      .from('messages')
      .select('user_id')
      .then(async (res) => {
        // Group by user_id and count
        const counts: Record<string, number> = {};
        res.data?.forEach((msg: any) => {
          counts[msg.user_id] = (counts[msg.user_id] || 0) + 1;
        });
        return { data: counts };
      });

    // Get lead counts per user
    const { data: leadCounts } = await adminClient
      .from('leads')
      .select('user_id')
      .then(async (res) => {
        const counts: Record<string, number> = {};
        res.data?.forEach((lead: any) => {
          counts[lead.user_id] = (counts[lead.user_id] || 0) + 1;
        });
        return { data: counts };
      });

    // Map plans by user_id for easy lookup
    const plansByUserId: Record<string, any> = {};
    userPlans?.forEach((plan: any) => {
      plansByUserId[plan.user_id] = plan;
    });

    // Format user data
    const users = authUsers.users.map((authUser) => {
      const plan = plansByUserId[authUser.id];
      return {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || 'Unknown',
        industry: authUser.user_metadata?.industry || null,
        use_case: authUser.user_metadata?.use_case || null,
        created_at: authUser.created_at,
        last_sign_in: authUser.last_sign_in_at,
        email_confirmed: authUser.email_confirmed_at ? true : false,
        plan_type: plan?.plan_type || 'none',
        points_balance: plan?.points_balance || 0,
        message_count: (messageCounts as Record<string, number>)?.[authUser.id] || 0,
        lead_count: (leadCounts as Record<string, number>)?.[authUser.id] || 0,
      };
    });

    // Sort by created_at descending (newest first)
    users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      ok: true,
      users,
      total: users.length,
    });
  } catch (error) {
    console.error('Admin users API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
