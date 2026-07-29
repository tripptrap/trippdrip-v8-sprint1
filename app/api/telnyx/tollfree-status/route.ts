import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getTollFreeVerification, isTollFreeNumber } from '@/lib/telnyx';
import { isAdminEmail } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Live toll-free verification status (#43).
 *
 * Nothing in the app showed this before — `getVerifiedTollFreeNumbers()` gated
 * behaviour but its result was never displayed, so "are our numbers verified?"
 * could only be answered from the Telnyx portal. On 2026-07-28 a faulty script
 * answered it wrongly and, with nothing in-app to check against, the wrong
 * answer stood.
 *
 * Two scopes, because a TFV request is an account-level record that carries the
 * platform's own business contact details:
 *   - any user  -> their own toll-free numbers and whether each is verified
 *   - admin     -> plus the full request history with rejection reasons
 * Business address/contact fields are never returned to either.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const admin = isAdminEmail(user.email);
    const snapshot = await getTollFreeVerification();

    // The caller's own numbers. RLS already scopes this to them.
    const { data: ownNumbers } = await supabase
      .from('user_telnyx_numbers')
      .select('phone_number, friendly_name, status, is_primary')
      .eq('user_id', user.id);

    const numbers = (ownNumbers || [])
      .filter((n) => isTollFreeNumber(n.phone_number))
      .map((n) => ({
        phoneNumber: n.phone_number,
        friendlyName: n.friendly_name,
        status: n.status,
        isPrimary: n.is_primary,
        // null, not false, when the read failed — the UI must not render an
        // unknown as "not verified".
        verified: snapshot.ok ? snapshot.verified.has(n.phone_number) : null,
      }));

    const body: Record<string, any> = {
      ok: true,
      // Whether the *Telnyx read* succeeded. Distinct from `ok` above, which
      // only says this request was served.
      telnyxReachable: snapshot.ok,
      telnyxError: snapshot.error ?? null,
      checkedAt: new Date(snapshot.fetchedAt).toISOString(),
      numbers,
      isAdmin: admin,
    };

    if (admin) {
      // Pool numbers are shared inventory, not owned by any one user, so they
      // only appear in the admin view.
      const service = createServiceRoleClient();
      const { data: pool } = await service
        .from('number_pool')
        .select('phone_number, number_type, is_verified, is_assigned');

      body.poolNumbers = (pool || [])
        .filter((n) => n.number_type === 'tollfree' || isTollFreeNumber(n.phone_number))
        .map((n) => ({
          phoneNumber: n.phone_number,
          isAssigned: n.is_assigned,
          // What the DB believes vs what Telnyx currently says. #36 reconciles
          // these; showing both is how drift becomes visible.
          storedVerified: n.is_verified,
          liveVerified: snapshot.ok ? snapshot.verified.has(n.phone_number) : null,
        }));

      body.requests = snapshot.requests
        .slice()
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    return NextResponse.json(body);
  } catch (error: any) {
    console.error('Error in GET /api/telnyx/tollfree-status:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
