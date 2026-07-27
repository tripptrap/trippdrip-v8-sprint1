import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    const e164 = phone.startsWith('+') ? phone : `+${digits}`;

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

    const now = new Date().toISOString();
    const consentIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
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
      const { data: existingLead } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('user_id', business.id)
        .eq('phone', e164)
        .maybeSingle();

      if (!existingLead) {
        const { error: leadError } = await supabaseAdmin.from('leads').insert({
          user_id: business.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: e164,
          email: email?.trim() || null,
          source: 'opt_in_form',
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
