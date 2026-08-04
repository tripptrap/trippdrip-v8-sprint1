import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createBrand, createCampaign, EntityType, mapBrandStatus, mapCampaignStatus } from '@/lib/telnyx10dlc';
import { generateCampaignDefaults, CampaignDefaults } from '@/lib/telnyx10dlcDefaults';
import { validateBusinessEmail, explainBrandError } from '@/lib/validateBusinessEmail';
import { alertAdminsThrottled } from '@/lib/alerting';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Bypasses RLS — user_10dlc_registrations only allows writes from service_role
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const REQUIRED_FIELDS = [
  'entityType', 'legalBusinessName', 'displayName', 'contactPhone', 'contactEmail',
  'vertical', 'street', 'city', 'state', 'postalCode',
] as const;

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Server not configured (missing service role key)' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();

    for (const field of REQUIRED_FIELDS) {
      if (!body[field] || !String(body[field]).trim()) {
        return NextResponse.json({ ok: false, error: `${field} is required` }, { status: 400 });
      }
    }
    // Carriers reject an unreachable contact address, and Telnyx's own error
    // (`10019 Invalid email address`) arrives only after the registration row is
    // written — and does not say which field it means (#1). Checked here as well
    // as in the form, because the form is not the boundary.
    const emailCheck = validateBusinessEmail(body.contactEmail);
    if (!emailCheck.ok) {
      return NextResponse.json({ ok: false, error: emailCheck.reason, field: 'contactEmail' }, { status: 400 });
    }

    // A missing EIN is no longer an error (#1). Onboarding lets someone finish
    // signup without one, because demanding a tax ID before the account exists
    // loses people who are still deciding — so the details are saved and the
    // Telnyx submission simply is not made. Nothing is lost by waiting: what
    // the EIN actually buys is a number, and `checkNumberEligibility` is what
    // holds that line.
    //
    // Sole proprietor is not offered (#119). Telnyx requires an SMS OTP step for
    // sole props that nothing here implements, so a registration submitted as one
    // reaches Telnyx and then stops — the user's number never arrives and no
    // error explains why. Refusing up front is honest; the silent dead end was
    // not.
    //
    // Enforced here as well as removed from the two pickers, because a picker is
    // not a boundary and existing drafts may already hold this value.
    if (body.entityType === 'SOLE_PROPRIETOR') {
      return NextResponse.json({
        ok: false,
        error:
          'Sole proprietor registration is not available yet — carriers require an extra ' +
          'phone verification step we do not support. Register as an LLC or corporation, ' +
          'which is what an EIN covers.',
      }, { status: 400 });
    }

    const canSubmit = !!body.taxId?.trim();

    // ── Mock mode (free, no carriers, no fees) ──────────────────────────────
    //
    // Telnyx accepts `mock: true` on brands and campaigns: the flow runs and
    // returns real-shaped objects without contacting carriers, without the
    // $15-per-submission review fee, and without creating anything that can send.
    // It exists precisely so this can be exercised before a paying customer does.
    //
    // The route hardcoded `mock: false` in all three places, so the only way to
    // test per-user registration was to register a real business and pay for it.
    // Exactly one real registration has ever been created — ours — and it took
    // eight campaign submissions and Telnyx support to finish, so "does this work
    // for a customer" was genuinely unknown.
    //
    // Environment-controlled and NEVER from the request body: a caller-supplied
    // mock flag would let someone mark themselves registered without ever facing
    // a carrier.
    //
    // Scope is 10DLC only. Number ORDERS are still real and still cost money, so
    // a mock environment can prove registration works but must not be used to
    // test number purchase.
    const mock = process.env.TELNYX_10DLC_MOCK?.trim() === 'true';
    if (mock) {
      console.warn('⚠️ 10DLC registration running in MOCK mode — no carrier submission, no fees.');
    }

    // Block re-submission while a registration is already in flight or active.
    // Keyed on `brand_id`, not status: a draft has never been sent to Telnyx and
    // must stay editable, which is the whole point of letting someone finish
    // onboarding without an EIN and come back to it.
    const { data: existing } = await supabaseAdmin
      .from('user_10dlc_registrations')
      .select('id, brand_id, brand_status, campaign_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.brand_id && (existing.campaign_status === 'active' || existing.brand_status === 'pending' || existing.campaign_status === 'pending')) {
      return NextResponse.json({
        ok: false,
        error: `Registration already ${existing.campaign_status === 'active' ? 'active' : 'in progress'} — cannot resubmit.`,
      }, { status: 409 });
    }

    const country = body.country || 'US';

    const registrationRow: Record<string, any> = {
      user_id: user.id,
      entity_type: body.entityType,
      legal_business_name: body.legalBusinessName.trim(),
      display_name: body.displayName.trim(),
      tax_id: body.taxId?.trim() || null,
      contact_phone: body.contactPhone.trim(),
      contact_email: body.contactEmail.trim(),
      website: body.website?.trim() || null,
      vertical: body.vertical,
      street: body.street.trim(),
      city: body.city.trim(),
      state: body.state.trim(),
      postal_code: body.postalCode.trim(),
      country,
      is_mock: mock,
      brand_status: 'pending',
      brand_failure_reason: null,
      campaign_status: 'not_started',
      campaign_failure_reason: null,
      updated_at: new Date().toISOString(),
    };

    let registrationId = existing?.id;
    if (existing) {
      await supabaseAdmin.from('user_10dlc_registrations').update(registrationRow).eq('id', existing.id);
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('user_10dlc_registrations')
        .insert(registrationRow)
        .select('id')
        .single();
      if (insertError || !inserted) {
        return NextResponse.json({ ok: false, error: insertError?.message || 'Failed to create registration' }, { status: 500 });
      }
      registrationId = inserted.id;
    }

    // Saved, but not sent. Returning ok:true is deliberate — from the user's
    // side nothing failed, they simply have not supplied the one field that
    // starts the carrier clock. The client shows what is still needed.
    if (!canSubmit) {
      return NextResponse.json({
        ok: true,
        submitted: false,
        registrationId,
        reason: 'ein_required',
        message:
          'Business details saved. Add your EIN to submit for carrier registration — phone numbers stay unavailable until that is done.',
      });
    }

    // ── 1. Create the brand under THIS business's own identity ─────────────
    const brandResult = await createBrand({
      entityType: body.entityType as EntityType,
      displayName: body.displayName.trim(),
      companyName: body.legalBusinessName.trim(),
      ein: body.taxId?.trim(),
      phone: body.contactPhone.trim(),
      street: body.street.trim(),
      city: body.city.trim(),
      state: body.state.trim(),
      postalCode: body.postalCode.trim(),
      country,
      email: body.contactEmail.trim(),
      website: body.website?.trim() || undefined,
      vertical: body.vertical,
      mock,
    });

    if (!brandResult.success) {
      await supabaseAdmin.from('user_10dlc_registrations').update({
        brand_status: 'failed',
        brand_failure_reason: brandResult.error || 'Unknown error',
        updated_at: new Date().toISOString(),
      }).eq('id', registrationId);

      // Some brand failures are the user's to fix (a bad email); others are
      // ours and they cannot act on them at all. A negative Telnyx balance
      // blocks every brand creation on the account with
      // `20100 Insufficient Funds` — it blocked one outright on 2026-08-02, and
      // is the same root cause as the July number-order denials. Nobody was
      // told, so it presented as "registration is broken".
      //
      // This also makes explainBrandError's "support has been notified" true,
      // which it was not before.
      const err = (brandResult.error || '').toLowerCase();
      const isOurProblem = err.includes('enough funds') || err.includes('insufficient funds');
      if (isOurProblem) {
        await alertAdminsThrottled({
          key: 'brand_registration_blocked',
          title: '10DLC brand registration is failing for everyone',
          body: `Telnyx refused to create a brand: ${brandResult.error}. This is account-level, not user-level — no agent can register until it is resolved. Check the Telnyx balance first (GET /v2/balance).`,
          data: { route: 'telnyx/10dlc/register', user_id: user.id, error: brandResult.error },
          escalate: true,
        });
      }

      return NextResponse.json({ ok: false, error: explainBrandError(brandResult.error) }, { status: 502 });
    }

    const brandStatus = mapBrandStatus(brandResult.status);
    await supabaseAdmin.from('user_10dlc_registrations').update({
      brand_id: brandResult.brandId,
      brand_status: brandStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', registrationId);

    // ── 2. Create the campaign — content always frames THIS business as the sender ──
    const { data: userRow } = await supabase.from('users').select('subscription_tier').eq('id', user.id).single();
    const usecase = userRow?.subscription_tier === 'scale' ? 'MIXED' : 'LOW_VOLUME';

    const defaults = generateCampaignDefaults({
      legalBusinessName: body.legalBusinessName.trim(),
      vertical: body.vertical,
      whatTheyOffer: body.whatTheyOffer,
      // Telnyx requires the actual opt-in form URL as evidence, and a real
      // contact method in the HELP reply — see docs/10DLC_REJECTION_HISTORY.md
      optInUrl: body.optInUrl?.trim() || body.website?.trim() || undefined,
      helpContact: body.contactEmail?.trim() || undefined,
    });
    const content: CampaignDefaults = { ...defaults, ...(body.campaignOverrides || {}) };

    // Confirmed against Telnyx's live /10dlc/enum/usecase endpoint (2026-07-27):
    // LOW_VOLUME requires 1-5 subUsecases, MIXED requires 2-5 — omitting them
    // entirely (as this route used to) fails with "requires minimum of N sub-usecases".
    const subUsecases = usecase === 'MIXED'
      ? ['MARKETING', 'ACCOUNT_NOTIFICATION', 'CUSTOMER_CARE']
      : ['MARKETING', 'ACCOUNT_NOTIFICATION'];

    const campaignResult = await createCampaign({
      brandId: brandResult.brandId!,
      usecase,
      subUsecases,
      description: content.description,
      sample1: content.sample1,
      sample2: content.sample2,
      messageFlow: content.messageFlow,
      helpMessage: content.helpMessage,
      optinMessage: content.optinMessage,
      optoutMessage: content.optoutMessage,
      optinKeywords: content.optinKeywords,
      optoutKeywords: content.optoutKeywords,
      helpKeywords: content.helpKeywords,
      subscriberOptin: true,
      subscriberOptout: true,
      subscriberHelp: true,
      numberPool: false,
      embeddedLink: false,
      embeddedPhone: false,
      ageGated: false,
      directLending: false,
      privacyPolicyLink: 'https://hyvewyre.com/privacy',
      termsAndConditionsLink: 'https://hyvewyre.com/terms',
      mock,
    });

    if (!campaignResult.success) {
      await supabaseAdmin.from('user_10dlc_registrations').update({
        campaign_status: 'failed',
        campaign_failure_reason: campaignResult.error || 'Unknown error',
        updated_at: new Date().toISOString(),
      }).eq('id', registrationId);
      return NextResponse.json({
        ok: false,
        error: `Brand registered, but campaign submission failed: ${campaignResult.error}`,
        brandStatus,
      }, { status: 502 });
    }

    const campaignStatus = mapCampaignStatus(campaignResult.status);
    await supabaseAdmin.from('user_10dlc_registrations').update({
      campaign_id: campaignResult.campaignId,
      campaign_use_case: usecase,
      campaign_status: campaignStatus,
      campaign_failure_reason: campaignResult.failureReasons?.join(' | ') || null,
      updated_at: new Date().toISOString(),
    }).eq('id', registrationId);

    return NextResponse.json({
      ok: true,
      brandStatus,
      campaignStatus,
      failureReasons: campaignResult.failureReasons || null,
    });
  } catch (error: any) {
    console.error('Error in POST /api/telnyx/10dlc/register:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
