// API Route: Voice Call TwiML Handler
// Generates TwiML instructions for voice calls

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const params: Record<string, string> = {};

    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Get query params for context
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const leadId = searchParams.get('leadId');

    console.log('📞 Voice call connected:', {
      CallSid: params.CallSid,
      From: params.From,
      To: params.To,
      userId,
      leadId,
    });

    // For now, just connect the call (no IVR or forwarding)
    // In the future, you can add:
    // - Call forwarding with <Dial>
    // - IVR menus with <Gather>
    // - Voicemail with <Record>
    // - Text-to-speech with <Say>

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">This call is being connected. Please hold.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">You can now speak with the other party.</Say>
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error('Error generating TwiML:', error);

    // Return error TwiML
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

// Handle GET requests (for testing)
export async function GET(req: NextRequest) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">This is a test call. The TwiML endpoint is working correctly.</Say>
  <Hangup/>
</Response>`;

  return new NextResponse(twiml, {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
