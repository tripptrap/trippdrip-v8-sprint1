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

    // Get total money spent per user from points_transactions (purchase/subscription actions)
    const totalSpentByUser: Record<string, number> = {};
    try {
      const { data: transactions } = await adminClient
        .from('points_transactions')
        .select('user_id, points_amount, action_type, amount_paid')
        .in('action_type', ['purchase', 'subscription']);
      transactions?.forEach((t: any) => {
        if (t.user_id) {
          let dollarAmount = 0;
          if (t.amount_paid && t.amount_paid > 0) {
            // Use actual Stripe amount (stored in cents)
            dollarAmount = t.amount_paid / 100;
          } else if (t.points_amount) {
            // Fallback for historical records without amount_paid
            if (t.action_type === 'subscription') {
              dollarAmount = t.points_amount >= 10000 ? 98 : 30;
            } else {
              // Estimate point packs based on known pricing
              if (t.points_amount >= 60000) dollarAmount = 510;
              else if (t.points_amount >= 25000) dollarAmount = 225;
              else if (t.points_amount >= 10000) dollarAmount = 95;
              else if (t.points_amount >= 4000) dollarAmount = 40;
              else dollarAmount = t.points_amount * 0.01;
            }
          }
          totalSpentByUser[t.user_id] = (totalSpentByUser[t.user_id] || 0) + dollarAmount;
        }
      });
    } catch (e) {
      console.log('Could not fetch spending data:', e);
    }

    // Get message counts and spam data per user
    const spamDataByUser: Record<string, { totalScore: number; count: number; highSpamCount: number }> = {};
    const { data: messageCounts } = await adminClient
      .from('messages')
      .select('user_id, spam_score')
      .then(async (res) => {
        const counts: Record<string, number> = {};
        res.data?.forEach((msg: any) => {
          counts[msg.user_id] = (counts[msg.user_id] || 0) + 1;
          // Aggregate spam data
          if (!spamDataByUser[msg.user_id]) {
            spamDataByUser[msg.user_id] = { totalScore: 0, count: 0, highSpamCount: 0 };
          }
          const score = msg.spam_score || 0;
          spamDataByUser[msg.user_id].totalScore += score;
          spamDataByUser[msg.user_id].count += 1;
          if (score >= 30) {
            spamDataByUser[msg.user_id].highSpamCount += 1;
          }
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

    // Get Telnyx numbers per user
    const telnyxNumbersByUser: Record<string, { phone_number: string; friendly_name: string | null; status: string; created_at: string }[]> = {};
    try {
      const { data: telnyxNumbers } = await adminClient
        .from('user_telnyx_numbers')
        .select('user_id, phone_number, friendly_name, status, created_at');
      telnyxNumbers?.forEach((num: any) => {
        if (!telnyxNumbersByUser[num.user_id]) {
          telnyxNumbersByUser[num.user_id] = [];
        }
        telnyxNumbersByUser[num.user_id].push({
          phone_number: num.phone_number,
          friendly_name: num.friendly_name,
          status: num.status,
          created_at: num.created_at,
        });
      });
    } catch (e) {
      console.log('Could not fetch Telnyx numbers:', e);
    }

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
        avg_spam_score: spamDataByUser[authUser.id]?.count
          ? Math.round(spamDataByUser[authUser.id].totalScore / spamDataByUser[authUser.id].count)
          : 0,
        high_spam_count: spamDataByUser[authUser.id]?.highSpamCount || 0,
        telnyx_numbers: telnyxNumbersByUser[authUser.id] || [],
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
