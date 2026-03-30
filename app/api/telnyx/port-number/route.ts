import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

// GET /api/telnyx/port-number — list user's porting orders
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data, error } = await supabase
      .from('porting_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ orders: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/telnyx/port-number — submit a porting request
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

    // Require paid subscription
    const { data: userRow } = await supabase
      .from('users')
      .select('subscription_tier, account_status, email, full_name, business_name')
      .eq('id', user.id)
      .single();

    const isPaid = userRow?.subscription_tier === 'growth' || userRow?.subscription_tier === 'scale';
    if (!isPaid || userRow?.account_status !== 'active') {
      return NextResponse.json(
        { error: 'An active Growth or Scale subscription is required to port numbers.' },
        { status: 403 }
      );
    }

    const {
      phoneNumber,
      carrierName,
      accountNumber,
      accountPin,
      authorizedName,
      billingStreet,
      billingCity,
      billingState,
      billingZip,
    } = await req.json();

    // Validate required fields
    const missing = [
      !phoneNumber && 'Phone number',
      !carrierName && 'Carrier name',
      !accountNumber && 'Account number',
      !accountPin && 'Account PIN',
      !authorizedName && 'Authorized contact name',
      !billingStreet && 'Billing street',
      !billingCity && 'Billing city',
      !billingState && 'Billing state',
      !billingZip && 'Billing ZIP',
    ].filter(Boolean);

    if (missing.length > 0) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 });
    }

    // Normalize phone number to E.164
    const cleaned = phoneNumber.replace(/\D/g, '');
    const e164 = cleaned.length === 10 ? `+1${cleaned}` : cleaned.startsWith('1') ? `+${cleaned}` : `+${cleaned}`;

    // Check for duplicate porting request
    const { data: existing } = await supabaseAdmin
      .from('porting_orders')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('phone_number', e164)
      .not('status', 'in', '("failed","cancelled")')
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'A porting request for this number is already in progress.' },
        { status: 400 }
      );
    }

    // Save request to DB first (so it's tracked even if Telnyx call fails)
    const { data: order, error: dbError } = await supabaseAdmin
      .from('porting_orders')
      .insert({
        user_id: user.id,
        phone_number: e164,
        carrier_name: carrierName,
        account_number: accountNumber,
        account_pin: accountPin,
        authorized_name: authorizedName,
        billing_street: billingStreet,
        billing_city: billingCity,
        billing_state: billingState,
        billing_zip: billingZip,
        status: 'submitted',
      })
      .select()
      .single();

    if (dbError || !order) {
      throw new Error(dbError?.message || 'Failed to save porting request');
    }

    // Attempt to submit to Telnyx porting API
    const apiKey = process.env.TELNYX_API_KEY;
    let telnyxPortingId: string | null = null;
    let finalStatus = 'submitted';
    let statusDetails: string | null = null;

    if (apiKey) {
      try {
        const telnyxBody = {
          misc: {
            type: 'full_port',
            losing_carrier_account_info: {
              account_number: accountNumber,
              account_pin: accountPin,
              account_name: authorizedName,
              email: user.email,
            },
          },
          phone_numbers: [{ phone_number: e164 }],
          end_user: {
            admin: {
              entity_name: userRow?.business_name || authorizedName,
              auth_person_name: authorizedName,
              phone_number: e164,
              email: user.email,
              address: {
                street_address: billingStreet,
                city: billingCity,
                state: billingState,
                zip: billingZip,
                country: 'US',
              },
            },
            billing: {
              account_number: accountNumber,
              pin: accountPin,
              auth_person_name: authorizedName,
              phone_number: e164,
              address: {
                street_address: billingStreet,
                city: billingCity,
                state: billingState,
                zip: billingZip,
                country: 'US',
              },
            },
          },
        };

        const telnyxRes = await fetch('https://api.telnyx.com/v2/porting_orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(telnyxBody),
        });

        const telnyxData = await telnyxRes.json();

        if (telnyxRes.ok && telnyxData.data?.id) {
          telnyxPortingId = telnyxData.data.id;
          finalStatus = 'pending';
          statusDetails = 'Submitted to carrier. Porting typically takes 1–2 weeks.';
          console.log('✅ Telnyx porting order created:', telnyxPortingId);
        } else {
          // Telnyx rejected — flag for manual review (e.g. LOA document required)
          finalStatus = 'review_needed';
          statusDetails = telnyxData.errors?.[0]?.detail || 'Additional documentation may be required. Our team will contact you.';
          console.warn('⚠️ Telnyx porting rejected, flagging for review:', telnyxData.errors);
        }
      } catch (telnyxErr: any) {
        finalStatus = 'review_needed';
        statusDetails = 'Could not reach carrier network. Our team will follow up within 1 business day.';
        console.error('Telnyx porting API error:', telnyxErr.message);
      }
    } else {
      // No API key — flag for manual processing
      finalStatus = 'review_needed';
      statusDetails = 'Request received. Our team will process your port within 1 business day.';
    }

    // Update DB record with Telnyx result
    await supabaseAdmin
      .from('porting_orders')
      .update({
        telnyx_porting_order_id: telnyxPortingId,
        status: finalStatus,
        status_details: statusDetails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return NextResponse.json({
      success: true,
      orderId: order.id,
      telnyxPortingId,
      status: finalStatus,
      statusDetails,
      message: finalStatus === 'pending'
        ? 'Porting request submitted successfully! Expect 1–2 weeks for completion.'
        : 'Porting request received. Our team will follow up shortly.',
    });
  } catch (error: any) {
    console.error('Port number error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
