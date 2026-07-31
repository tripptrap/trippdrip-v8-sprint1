// Whether the signed-in user may take a phone number yet (#1).
//
// The gate itself lives in lib/numberEligibility and is enforced inside each of
// the three acquisition routes — this endpoint exists purely so the UI can
// *explain* the situation before the user clicks something that will fail.
// It is not the boundary; hiding a button is never a boundary.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkNumberEligibility } from '@/lib/numberEligibility';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    const gate = await checkNumberEligibility(supabaseAdmin, user.id);

    return NextResponse.json({
      ok: true,
      allowed: gate.allowed,
      code: gate.allowed ? null : gate.code,
      reason: gate.allowed ? null : gate.reason,
    });
  } catch (error: any) {
    console.error('Error in GET /api/number-eligibility:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
