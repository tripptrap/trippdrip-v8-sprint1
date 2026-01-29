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

    // Get user data from users table (subscription_tier and credits set by Stripe webhook)
    const { data: usersData } = await adminClient
      .from('users')
      .select('id, subscription_tier, credits, monthly_credits, phone');

    // Get total money spent per user from Stripe payments
    const { data: paymentsData } = await adminClient
      .from('payments')
      .select('user_id, amount');
    const totalSpentByUser: Record<string, number> = {};
    paymentsData?.forEach((p: any) => {
      if (p.user_id && p.amount) {
        totalSpentByUser[p.user_id] = (totalSpentByUser[p.user_id] || 0) + (p.amount / 100);
      }
    });

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

    // Map user data by id for easy lookup
    const userDataById: Record<string, any> = {};
    usersData?.forEach((userData: any) => {
      userDataById[userData.id] = userData;
    });

    // Format user data
    const users = authUsers.users.map((authUser) => {
      const userData = userDataById[authUser.id];
      // Map subscription_tier to display name
      const planType = userData?.subscription_tier === 'premium' ? 'premium' :
                       userData?.subscription_tier === 'basic' ? 'basic' : 'none';
      return {
        id: authUser.id,
        email: authUser.email,
        personal_email: authUser.user_metadata?.personal_email || authUser.email || null,
        phone: userData?.phone || authUser.user_metadata?.phone || authUser.phone || null,
        full_name: authUser.user_metadata?.full_name || 'Unknown',
        industry: authUser.user_metadata?.industry || null,
        use_case: authUser.user_metadata?.use_case || null,
        created_at: authUser.created_at,
        last_sign_in: authUser.last_sign_in_at,
        email_confirmed: authUser.email_confirmed_at ? true : false,
        plan_type: planType,
        points_balance: userData?.credits || 0,
        total_spent: totalSpentByUser[authUser.id] || 0,
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
