import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const type = searchParams.get('type'); // spend, earn, purchase, subscription
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    // Build query
    let query = supabase
      .from('points_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (type && type !== 'all') {
      query = query.eq('action_type', type);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: transactions, error: fetchError, count } = await query;

    if (fetchError) {
      console.error('Error fetching transactions:', fetchError);
      return NextResponse.json({ ok: false, error: 'Failed to fetch transactions' }, { status: 500 });
    }

    // Get current balance
    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    // Calculate summary stats
    const { data: allTransactions } = await supabase
      .from('points_transactions')
      .select('action_type, points_amount')
      .eq('user_id', user.id);

    let totalSpent = 0;
    let totalEarned = 0;
    let totalPurchased = 0;

    (allTransactions || []).forEach(t => {
      if (t.action_type === 'spend') {
        totalSpent += Math.abs(t.points_amount);
      } else if (t.action_type === 'earn') {
        totalEarned += t.points_amount;
      } else if (t.action_type === 'purchase' || t.action_type === 'subscription') {
        totalPurchased += t.points_amount;
      }
    });

    return NextResponse.json({
      ok: true,
      transactions: transactions || [],
      total: count || 0,
      currentBalance: userData?.credits || 0,
      summary: {
        totalSpent,
        totalEarned,
        totalPurchased,
      },
    });
  } catch (error: any) {
    console.error('Error in credits history API:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
