// DEBUG: Check users table structure - REMOVE AFTER DEBUGGING
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

export async function GET(req: NextRequest) {
  // Admin only
  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Query users table
  const { data: usersData, error: usersError } = await adminClient
    .from('users')
    .select('*')
    .limit(3);

  // Query auth users
  const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 3 });

  return NextResponse.json({
    usersTable: {
      error: usersError?.message || null,
      count: usersData?.length || 0,
      columns: usersData?.[0] ? Object.keys(usersData[0]) : [],
      sampleRows: usersData?.map((u: any) => {
        // Redact sensitive data
        const row: any = {};
        for (const [key, value] of Object.entries(u)) {
          if (key === 'id') row[key] = value;
          else if (typeof value === 'string' && (value as string).length > 20) row[key] = `${(value as string).substring(0, 10)}...`;
          else row[key] = value;
        }
        return row;
      }),
    },
    authUsers: {
      count: authUsers?.users?.length || 0,
      sampleIds: authUsers?.users?.slice(0, 3).map(u => u.id),
    }
  });
}
