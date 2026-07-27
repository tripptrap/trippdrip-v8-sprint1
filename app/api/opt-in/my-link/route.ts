import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { slugifyBusinessName } from '@/lib/optInConsent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

/**
 * GET /api/opt-in/my-link — returns the caller's branded opt-in URL,
 * generating the slug on first request. This URL is what gets submitted to
 * Telnyx as consent evidence for their 10DLC campaign.
 */
export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: row } = await supabaseAdmin
      .from('users')
      .select('id, business_name, opt_in_slug')
      .eq('id', user.id)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    let slug = row.opt_in_slug;

    if (!slug) {
      if (!row.business_name?.trim()) {
        return NextResponse.json({
          ok: true,
          slug: null,
          url: null,
          businessName: null,
          needsBusinessName: true,
        });
      }

      // Claim a unique slug, suffixing on collision with another business
      const base = slugifyBusinessName(row.business_name) || 'business';
      let candidate = base;
      for (let n = 2; n < 50; n++) {
        const { data: taken } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('opt_in_slug', candidate)
          .maybeSingle();
        if (!taken) break;
        candidate = `${base}-${n}`;
      }

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ opt_in_slug: candidate })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to assign opt_in_slug:', updateError);
        return NextResponse.json({ ok: false, error: 'Failed to create opt-in link' }, { status: 500 });
      }
      slug = candidate;
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hyvewyre.com';

    return NextResponse.json({
      ok: true,
      slug,
      url: `${baseUrl}/opt-in/${slug}`,
      businessName: row.business_name,
      needsBusinessName: false,
    });
  } catch (error: any) {
    console.error('Error in GET /api/opt-in/my-link:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
