import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { limitByIp, observeRate, clientIp } from '@/lib/rateLimit';
import { normalizePhone } from '@/lib/phone';
import { consentFields } from '@/lib/leadConsent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Per-IP, and it blocks. The form validates client-side before posting, so a
 * real person sends one request — even a retry after a network error stays far
 * under this, and a household or small office opting in together fits (#99).
 */
const IP_LIMIT = 5;
const IP_WINDOW_SECONDS = 60;

/**
 * Per-slug, and it deliberately does **not** block.
 *
 * Capping one business's opt-in page would hand anyone a way to deny it their
 * signups: burn the quota from a botnet and real customers get turned away. A
 * lost opt-in is worse than a junk one — junk can be filtered by pattern
 * afterwards, a missed customer and their consent record cannot be recovered.
 * So this only makes a distributed flood visible; the per-IP limit above is
 * what actually blocks.
 */
const SLUG_CEILING = 100;
const SLUG_WINDOW_SECONDS = 3600;

/**
 * POST /api/opt-in/submit — public endpoint backing /opt-in/<slug>.
 *
 * Records SMS consent for a specific business and creates the lead. Stores a
 * durable audit trail (exact disclaimer text, timestamp, IP, user agent)
 * because carriers can demand proof of consent long after the fact, and the
 * disclaimer wording may change between now and then.
 *
 * Unauthenticated by design — consumers opting in are not HyveWyre users.
 * Uses the service-role client, so every write below is explicitly scoped to
 * the user_id resolved from the slug; nothing is taken from the request body.
 */

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
    }

    // Before the body is read: every accepted call writes a consent audit row
    // and creates a lead, and this endpoint is public by design (#99).
    const limited = await limitByIp(req, 'opt-in-submit', IP_LIMIT, IP_WINDOW_SECONDS);
    if (limited) return limited;

    const body = await req.json();
    const { slug, firstName, lastName, email, phone, smsConsent, consentText } = body;

    if (!slug || !firstName?.trim() || !lastName?.trim() || !phone) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (smsConsent !== true) {
      return NextResponse.json({ ok: false, error: 'SMS consent is required' }, { status: 400 });
    }

    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      return NextResponse.json({ ok: false, error: 'Invalid phone number' }, { status: 400 });
    }
    // This used to be `phone.startsWith('+') ? phone : '+' + digits`, which for
    // a 10-digit US number — what this form's placeholder asks for — produced
    // `+5550001234` with no country code (#100). normalizePhone() applies the
    // same rule as the SQL normalize_phone() that DNC and lead matching use.
    const e164 = normalizePhone(phone);
    if (!e164) {
      return NextResponse.json({ ok: false, error: 'Invalid phone number' }, { status: 400 });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'Invalid email address' }, { status: 400 });
    }

    // Resolve the owning business from the slug — never trust an id in the body
    const { data: business } = await supabaseAdmin
      .from('users')
      .select('id, business_name')
      .eq('opt_in_slug', slug)
      .maybeSingle();

    if (!business) {
      return NextResponse.json({ ok: false, error: 'Opt-in page not found' }, { status: 404 });
    }

    // Counted only after the slug resolves to a real business. Counting an
    // unvalidated slug would let a caller grow the counter table without bound
    // by rotating slugs that don't exist.
    await observeRate({
      key: `opt-in-slug:${slug}`,
      limit: SLUG_CEILING,
      windowSeconds: SLUG_WINDOW_SECONDS,
      title: 'Unusual volume on a branded opt-in page',
      body: (count) =>
        `The opt-in page /opt-in/${slug} (${business.business_name || business.id}) has taken ${count} submissions in the last hour, past the ${SLUG_CEILING} expected. Submissions are still being accepted — this ceiling deliberately does not block, because turning away real opt-ins is worse than absorbing junk. Check whether this is a campaign or a flood, and review the recent consent records for that business before relying on them as evidence.`,
      data: { slug, user_id: business.id },
    });

    const now = new Date().toISOString();
    // Shared clientIp(): prefers req.ip and x-vercel-forwarded-for over the raw
    // x-forwarded-for this used to read. The consent IP is the evidence a
    // carrier may ask for, so it is worth resolving from the most reliable
    // source available rather than the first header that happens to be set.
    const consentIp = clientIp(req);
    const consentUserAgent = req.headers.get('user-agent') || null;

    // Consent audit record — upsert so a repeat opt-in refreshes the evidence
    const { error: consentError } = await supabaseAdmin
      .from('contact_form_submissions')
      .upsert(
        {
          user_id: business.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email?.trim() || '',
          phone: e164,
          sms_consent: true,
          source: 'branded_opt_in_page',
          consent_text: consentText || null,
          consent_ip: consentIp,
          consent_user_agent: consentUserAgent,
          consent_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id,phone' }
      );

    if (consentError) {
      console.error('Opt-in consent record failed:', consentError);
      return NextResponse.json({ ok: false, error: 'Failed to record consent' }, { status: 500 });
    }

    // Create the lead for this business if they don't already have one.
    // A failure here must NOT lose the consent record above, so it's non-fatal.
    try {
      // find_lead_by_phone rather than .eq('phone', e164): an exact comparison
      // misses a lead whose number was imported in another format, and creates a
      // duplicate for the same person. That is the bug #95 fixed on the inbound
      // path; the RPC compares normalised forms, the same way check_dnc does.
      const { data: existingLeadId } = await supabaseAdmin
        .rpc('find_lead_by_phone', { p_user_id: business.id, p_phone: e164 });

      if (!existingLeadId) {
        const { error: leadError } = await supabaseAdmin.from('leads').insert({
          user_id: business.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: e164,
          email: email?.trim() || null,
          source: 'opt_in_form',
          // The only intake with consumer-side evidence behind it — the verbatim
          // disclosure, IP, user agent and timestamp are in the
          // contact_form_submissions row written just above (#130).
          ...consentFields('opt_in_form'),
          // leads_status_check allows only active/inactive/archived/deleted
          status: 'active',
          created_at: now,
          updated_at: now,
        });
        if (leadError) {
          console.error('Opt-in lead creation failed (consent still recorded):', leadError);
        }
      }
    } catch (leadErr) {
      console.error('Opt-in lead creation failed (consent still recorded):', leadErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error in POST /api/opt-in/submit:', error);
    return NextResponse.json({ ok: false, error: 'Something went wrong' }, { status: 500 });
  }
}
