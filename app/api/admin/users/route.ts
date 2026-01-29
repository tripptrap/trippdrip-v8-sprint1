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
    // Select all columns to avoid failures from missing column names
    const { data: usersData, error: usersDataError } = await adminClient
      .from('users')
      .select('*');

    if (usersDataError) {
      console.error('Error fetching users data:', usersDataError);
    } else if (usersData && usersData.length > 0) {
      console.log('Admin: Sample user row columns:', Object.keys(usersData[0]));
    }

    // Get total money spent per user from points_transactions (purchase actions)
    const totalSpentByUser: Record<string, number> = {};
    try {
      const { data: transactions } = await adminClient
        .from('points_transactions')
        .select('user_id, points_amount, action_type')
        .in('action_type', ['purchase', 'subscription']);
      transactions?.forEach((t: any) => {
        if (t.user_id && t.points_amount) {
          // Estimate spend: subscription credits are included in plan price
          // Basic = $29/mo (3000 credits), Premium = $79/mo (10000 credits), Point packs vary
          let dollarAmount = 0;
          if (t.action_type === 'subscription') {
            dollarAmount = t.points_amount >= 10000 ? 79 : 29;
          } else {
            // Point packs: roughly $0.01 per point
            dollarAmount = t.points_amount * 0.01;
          }
          totalSpentByUser[t.user_id] = (totalSpentByUser[t.user_id] || 0) + dollarAmount;
        }
      });
    } catch (e) {
      console.log('Could not fetch spending data:', e);
    }

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

    // Map user data by EMAIL for lookup (users table IDs don't match auth user IDs)
    const userDataByEmail: Record<string, any> = {};
    usersData?.forEach((userData: any) => {
      if (userData.email) {
        userDataByEmail[userData.email.toLowerCase()] = userData;
      }
    });

    // Format user data
    const users = authUsers.users.map((authUser) => {
      const userData = userDataByEmail[(authUser.email || '').toLowerCase()];
      // Map subscription_tier: "premium" -> premium, "basic" -> basic, "free"/null -> none
      const tier = userData?.subscription_tier || userData?.plan_type || null;
      const planType = tier === 'premium' || tier === 'professional' ? 'premium' :
                       tier === 'basic' || tier === 'starter' ? 'basic' : 'none';
      // Credits from users table
      const credits = userData?.credits || 0;
      return {
        id: authUser.id,
        email: authUser.email,
        personal_email: authUser.user_metadata?.personal_email || authUser.email || null,
        phone: userData?.phone_number || authUser.user_metadata?.phone || authUser.phone || null,
        full_name: authUser.user_metadata?.full_name || userData?.full_name || 'Unknown',
        industry: authUser.user_metadata?.industry || null,
        use_case: authUser.user_metadata?.use_case || null,
        created_at: authUser.created_at,
        last_sign_in: authUser.last_sign_in_at,
        email_confirmed: authUser.email_confirmed_at ? true : false,
        account_status: userData?.account_status || ((authUser as any).banned_until ? 'suspended' : 'active'),
        plan_type: planType,
        points_balance: credits,
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
