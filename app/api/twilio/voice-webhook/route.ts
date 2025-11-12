// API Route: Twilio Incoming Voice Call Webhook
// Handles incoming voice calls to user's Twilio numbers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

// Create Supabase admin client (bypasses RLS for webhooks)
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    // Parse form data from Twilio
    const formData = await req.formData();
    const params: Record<string, string> = {};

    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const from = params.From;
    const to = params.To;
    const callSid = params.CallSid;
    const callStatus = params.CallStatus;

    console.log('📞 Incoming call:', {
      from,
      to,
      callSid,
      callStatus,
    });

    // Validate webhook signature for security
    const signature = req.headers.get('x-twilio-signature');
    if (signature) {
      const url = req.url;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (authToken) {
        const isValid = twilio.validateRequest(authToken, signature, url, params);

        if (!isValid) {
          console.error('⚠️ Invalid Twilio signature on incoming call webhook');

          const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry, but we cannot verify this call. Please try again later.</Say>
  <Hangup/>
</Response>`;

          return new NextResponse(errorTwiml, {
            status: 403,
            headers: { 'Content-Type': 'text/xml' }
          });
        }
      }
    }

    if (!supabaseAdmin) {
      console.error('Supabase admin client not configured');

      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry, but there was a system error. Please try again later.</Say>
  <Hangup/>
</Response>`;

      return new NextResponse(errorTwiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Find which user owns this phone number
    const { data: numberData, error: numberError } = await supabaseAdmin
      .from('user_twilio_numbers')
      .select('user_id, phone_number')
      .eq('phone_number', to)
      .eq('status', 'active')
      .single();

    if (numberError || !numberData) {
      console.error('Phone number not found in database:', to);

      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry, but this number is not configured to receive calls.</Say>
  <Hangup/>
</Response>`;

      return new NextResponse(errorTwiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const userId = numberData.user_id;

    // Save call record to database
    const { error: dbError } = await supabaseAdmin.from('twilio_calls').insert({
      user_id: userId,
      call_sid: callSid,
      from_number: from,
      to_number: to,
      direction: 'inbound',
      status: callStatus,
      created_at: new Date().toISOString(),
    });

    if (dbError) {
      console.error('Error saving call record:', dbError);
    }

    // Get user's preferences for call handling
    const { data: userPrefs } = await supabaseAdmin
      .from('user_preferences')
      .select('call_forwarding_enabled, call_forwarding_number, voicemail_enabled')
      .eq('user_id', userId)
      .single();

    // Generate TwiML response based on user preferences
    let twiml: string;

    if (userPrefs?.call_forwarding_enabled && userPrefs.call_forwarding_number) {
      // Forward call to user's phone number
      const statusCallbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/call-status`;

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Please hold while we connect your call.</Say>
  <Dial action="${statusCallbackUrl}" method="POST" timeout="30">
    <Number>${userPrefs.call_forwarding_number}</Number>
  </Dial>
  <Say voice="Polly.Joanna">The call could not be completed. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else if (userPrefs?.voicemail_enabled) {
      // Send to voicemail
      const recordingCallbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com'}/api/twilio/voicemail-recording`;

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">You have reached the voicemail. Please leave a message after the beep.</Say>
  <Record action="${recordingCallbackUrl}" method="POST" maxLength="120" playBeep="true" />
  <Say voice="Polly.Joanna">Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else {
      // Default: play message and hang up
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. This number is not currently accepting calls. Please try again later.</Say>
  <Hangup/>
</Response>`;
    }

    console.log('✅ Generated TwiML for incoming call');

    return new NextResponse(twiml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });

  } catch (error: any) {
    console.error('Incoming call webhook error:', error);

    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry, but there was an error processing your call. Please try again later.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(errorTwiml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}
