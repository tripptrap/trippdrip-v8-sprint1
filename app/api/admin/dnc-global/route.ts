// Operator management of the platform-wide DNC list (#88).
//
// dnc_global blocks a number for EVERY tenant. check_dnc() has always read it,
// but until #93 nothing wrote to it, and there was still no deliberate way for
// an operator to add one — litigators, repeat complainants, an imported
// registry. This is that path.
//
// Deliberately admin-only and separate from /api/dnc/*, which is user-scoped
// and writes dnc_list. A tenant must not be able to suppress a number for
// everyone else on the platform.
//
// All three handlers go through the RPCs rather than touching the table: they
// own normalisation, and check_dnc() matches on `normalize_phone(input)`. An
// entry normalised any other way silently fails to block — the worst possible
// outcome for this table.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  if (!isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

/** List every global DNC entry. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  // RLS on dnc_global denies everyone; service_role bypasses it (#88).
  const { data, error } = await createServiceRoleClient()
    .from('dnc_global')
    .select('id, phone_number, normalized_phone, reason, source, notes, complaint_count, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('GET /api/admin/dnc-global:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entries: data ?? [], count: data?.length ?? 0 });
}

/** Add a number to the global list. */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { phoneNumber, reason, notes } = await req.json().catch(() => ({}));
  if (!phoneNumber) {
    return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
  }

  const { data, error } = await createServiceRoleClient().rpc('add_to_global_dnc', {
    p_phone_number: phoneNumber,
    p_reason: reason ?? null,
    p_notes: notes ?? null,
    p_source: 'admin',
  });

  if (error) {
    console.error(`Admin ${gate.user!.email} failed to add ${phoneNumber} to global DNC:`, error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = data as { already_present?: boolean; normalized_phone?: string };
  console.log(
    `🔒 Admin ${gate.user!.email} ${result?.already_present ? 're-confirmed' : 'added'} ` +
      `${result?.normalized_phone} on the GLOBAL DNC list — blocked for all tenants`
  );
  return NextResponse.json({ ok: true, ...(data as object) });
}

/** Remove a number from the global list. */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { phoneNumber } = await req.json().catch(() => ({}));
  if (!phoneNumber) {
    return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
  }

  const { data: removed, error } = await createServiceRoleClient()
    .rpc('remove_from_global_dnc', { p_phone_number: phoneNumber });

  if (error) {
    console.error(`Admin ${gate.user!.email} failed to remove ${phoneNumber} from global DNC:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Un-blocking someone who opted out is a compliance decision, so it is logged
  // with the operator who made it rather than passing silently.
  console.log(
    removed
      ? `⚠️ Admin ${gate.user!.email} REMOVED ${phoneNumber} from the global DNC list — it can be messaged again`
      : `Admin ${gate.user!.email} tried to remove ${phoneNumber} from global DNC; it was not on the list`
  );
  return NextResponse.json({ ok: true, removed });
}
