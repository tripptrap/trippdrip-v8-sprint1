import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const mappedSettings = {
      smsProvider: settings.sms_provider,
      twilio: settings.twilio_config,
      stripe: settings.stripe_config,
      email: settings.email_config,
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
    const { smsProvider, twilio, stripe, email, spamProtection, autoRefill, optOutKeyword } = body;

    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const settingsData: any = {
      user_id: user.id,
      sms_provider: smsProvider,
      twilio_config: twilio,
      stripe_config: stripe,
      email_config: email,
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

    return NextResponse.json({ ok: true, settings: data });
  } catch (error: any) {
    console.error('Error in POST /api/settings:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
