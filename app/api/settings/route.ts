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
      settingsData.opt_out_keyword = optOutKeyword || null;
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
          auto_topup_amount: autoRefill?.amount ?? 1000,
        })
        .eq('id', user.id);
    }

    return NextResponse.json({ ok: true, settings: data });
  } catch (error: any) {
    console.error('Error in POST /api/settings:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
