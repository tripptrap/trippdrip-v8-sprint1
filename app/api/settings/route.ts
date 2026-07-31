import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, safeDecrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, settings: null, error: 'Not authenticated' }, { status: 401 });
    }

    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching settings:', error);
      return NextResponse.json({ ok: false, settings: null, error: error.message }, { status: 500 });
    }

    if (!settings) {
      const defaultSettings = {
        smsProvider: 'none',
        spamProtection: {
          enabled: true,
          blockOnHighRisk: true,
          maxHourlyMessages: 100,
          maxDailyMessages: 1000
        },
        autoRefill: {
          enabled: false,
          threshold: 100,
          amount: 500
        }
      };
      return NextResponse.json({ ok: true, settings: defaultSettings });
    }

    const emailConfig = settings.email_config;
    const decryptedEmailConfig = emailConfig
      ? {
          ...emailConfig,
          smtpPass: emailConfig.smtpPass ? safeDecrypt(emailConfig.smtpPass) : emailConfig.smtpPass,
          sendgridApiKey: emailConfig.sendgridApiKey ? safeDecrypt(emailConfig.sendgridApiKey) : emailConfig.sendgridApiKey,
        }
      : emailConfig;

    const mappedSettings = {
      stripe: settings.stripe_config,
      email: decryptedEmailConfig,
      optOutKeyword: settings.opt_out_keyword || undefined,
      spamProtection: settings.spam_protection,
      autoRefill: settings.auto_refill
    };

    return NextResponse.json({ ok: true, settings: mappedSettings });
  } catch (error: any) {
    console.error('Error in GET /api/settings:', error);
    return NextResponse.json({ ok: false, settings: null, error: error.message }, { status: 500 });
  }
}


/**
 * Validate a user's custom opt-out keyword (#108).
 *
 * A lead replying with this word goes on the DNC list, which is **permanent
 * and irreversible** — there is no path back to messaging them. That makes a
 * careless keyword unrecoverable for whoever trips it, so the collisions below
 * are rejected rather than warned about.
 *
 * The dangerous one is YES: it is an opt-in keyword and it is what leads are
 * asked to reply to confirm an appointment. Setting opt-out to YES would
 * permanently block every lead who confirmed a booking.
 *
 * STOP keeps working whatever is set here — the webhook checks its standard
 * list as well as this value, and STOP is what the 10DLC campaign registers
 * with the carriers.
 */
function validateOptOutKeyword(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Opt-out keyword must be text.' };

  const value = raw.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,20}$/.test(value)) {
    return { ok: false, error: 'Opt-out keyword must be a single word, 2-20 letters or numbers, no spaces or punctuation.' };
  }

  const reserved: Record<string, string> = {
    YES: 'leads reply YES to confirm appointments',
    START: 'START is the opt-in keyword',
    UNSTOP: 'UNSTOP is the opt-in keyword',
    HELP: 'HELP is reserved for help requests',
    INFO: 'INFO is reserved for help requests',
    CANCEL: 'CANCEL is used for appointment cancellations',
  };
  if (reserved[value]) {
    return { ok: false, error: `"${value}" cannot be an opt-out keyword — ${reserved[value]}.` };
  }

  return { ok: true, value };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { stripe, email, spamProtection, autoRefill, optOutKeyword } = body;

    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Encrypt secrets before they ever touch the database
    const encryptedEmailConfig = email
      ? {
          ...email,
          smtpPass: email.smtpPass ? encrypt(email.smtpPass) : email.smtpPass,
          sendgridApiKey: email.sendgridApiKey ? encrypt(email.sendgridApiKey) : email.sendgridApiKey,
        }
      : email;

    const settingsData: any = {
      user_id: user.id,
      stripe_config: stripe,
      email_config: encryptedEmailConfig,
      spam_protection: spamProtection,
      auto_refill: autoRefill,
    };

    // Only include opt_out_keyword if explicitly provided
    if (optOutKeyword !== undefined) {
      const validation = validateOptOutKeyword(optOutKeyword);
      if (!validation.ok) {
        return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
      }
      settingsData.opt_out_keyword = validation.value;
    }

    let data, error;

    if (existing) {
      const result = await supabase
        .from('user_settings')
        .update(settingsData)
        .eq('user_id', user.id)
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from('user_settings')
        .insert(settingsData)
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error saving settings:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Sync autoRefill settings to users table so the auto-buy cron can read them
    if (autoRefill !== undefined) {
      await supabase
        .from('users')
        .update({
          auto_topup: autoRefill?.enabled ?? false,
          auto_topup_threshold: autoRefill?.threshold ?? 50,
          // Smallest real pack; 1000 was not a purchasable size (#76).
          auto_topup_amount: autoRefill?.amount ?? 4000,
        })
        .eq('id', user.id);
    }

    return NextResponse.json({ ok: true, settings: data });
  } catch (error: any) {
    console.error('Error in POST /api/settings:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
