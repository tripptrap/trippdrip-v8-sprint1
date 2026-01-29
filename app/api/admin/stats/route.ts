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

    // Use service role client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get total users
    const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const totalUsers = authUsers?.users?.length || 0;

    // Get users by plan type from the users table
    const { data: usersData } = await adminClient
      .from('users')
      .select('*');

    const planCounts: Record<string, number> = { basic: 0, premium: 0, none: 0 };
    usersData?.forEach((u: any) => {
      const tier = u.subscription_tier || null;
      if (tier === 'premium' || tier === 'professional') {
        planCounts.premium += 1;
      } else if (tier === 'basic' || tier === 'starter') {
        planCounts.basic += 1;
      } else {
        // "free", null, or anything else = no plan
        planCounts.none += 1;
      }
    });
    // Users in auth but not in users table count as "none"
    const usersInTable = usersData?.length || 0;
    if (totalUsers > usersInTable) {
      planCounts.none += (totalUsers - usersInTable);
    }

    // Get total messages
    const { count: totalMessages } = await adminClient
      .from('messages')
      .select('*', { count: 'exact', head: true });

    // Get total leads
    const { count: totalLeads } = await adminClient
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // Get messages in last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { count: messagesLast24h } = await adminClient
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString());

    // Get new users in last 7 days
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const newUsersLastWeek = authUsers?.users?.filter(
      (u) => new Date(u.created_at) >= lastWeek
    ).length || 0;

    // Get new users in last 30 days
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    const newUsersLastMonth = authUsers?.users?.filter(
      (u) => new Date(u.created_at) >= lastMonth
    ).length || 0;

    // Get industry breakdown
    const industryCounts: Record<string, number> = {};
    authUsers?.users?.forEach((u) => {
      const industry = u.user_metadata?.industry || 'unknown';
      industryCounts[industry] = (industryCounts[industry] || 0) + 1;
    });

    // Get use case breakdown
    const useCaseCounts: Record<string, number> = {};
    authUsers?.users?.forEach((u) => {
      const useCase = u.user_metadata?.use_case || 'unknown';
      useCaseCounts[useCase] = (useCaseCounts[useCase] || 0) + 1;
    });

    // Get flagged messages count (spam_score >= 30)
    let flaggedMessages = 0;
    try {
      const { count } = await adminClient
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('spam_score', 30);
      flaggedMessages = count || 0;
    } catch (e) {
      console.log('Could not fetch spam stats:', e);
    }

    return NextResponse.json({
      ok: true,
      stats: {
        totalUsers,
        newUsersLastWeek,
        newUsersLastMonth,
        totalMessages: totalMessages || 0,
        messagesLast24h: messagesLast24h || 0,
        totalLeads: totalLeads || 0,
        flaggedMessages,
        planBreakdown: planCounts,
        industryBreakdown: industryCounts,
        useCaseBreakdown: useCaseCounts,
      },
    });
  } catch (error) {
    console.error('Admin stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
