import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTelnyxSMS } from '@/lib/telnyx';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { type, leadName, leadPhone, message } = await req.json();

    // Get user's profile and notification preferences
    const { data: userData } = await supabase
      .from('users')
      .select('phone_number, full_name')
      .eq('id', user.id)
      .single();

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('sms_alerts_enabled, sms_alert_new_message, sms_alert_low_credits, sms_alert_opt_out')
      .eq('user_id', user.id)
      .single();

    if (!userData?.phone_number) {
      return NextResponse.json({ ok: false, error: 'No personal phone number on file' });
    }

    if (!prefs?.sms_alerts_enabled) {
      return NextResponse.json({ ok: false, error: 'SMS alerts disabled' });
    }

    // Check per-type preference
    if (type === 'new_message' && !prefs.sms_alert_new_message) {
      return NextResponse.json({ ok: false, error: 'New message alerts disabled' });
    }
    if (type === 'low_credits' && !prefs.sms_alert_low_credits) {
      return NextResponse.json({ ok: false, error: 'Low credit alerts disabled' });
    }
    if (type === 'opt_out' && !prefs.sms_alert_opt_out) {
      return NextResponse.json({ ok: false, error: 'Opt-out alerts disabled' });
    }

    // Get user's primary Telnyx number to send from
    const { data: telnyxNum } = await supabase
      .from('user_telnyx_numbers')
      .select('phone_number')
      .eq('user_id', user.id)
      .eq('is_primary', true)
      .single();

    // Build the alert message
    let alertBody = '';
    if (type === 'new_message') {
      alertBody = `HyveWyre: New reply from ${leadName || leadPhone}${message ? ` — "${message.slice(0, 80)}${message.length > 80 ? '...' : ''}"` : ''}. Open the app to respond.`;
    } else if (type === 'low_credits') {
      alertBody = `HyveWyre: You're running low on credits. Top up at hyvewyre.com to keep SMS flowing.`;
    } else if (type === 'opt_out') {
      alertBody = `HyveWyre: ${leadName || leadPhone} has opted out (STOP). They've been added to your DNC list.`;
    } else {
      alertBody = message || 'HyveWyre notification';
    }

    const result = await sendTelnyxSMS({
      to: userData.phone_number,
      message: alertBody,
      from: telnyxNum?.phone_number,
    });

    return NextResponse.json({ ok: result.success, error: result.error });
  } catch (error: any) {
    console.error('SMS alert error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
