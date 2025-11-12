// API Route: Twilio Voicemail Recording Callback
// Handles voicemail recordings from incoming calls

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

    console.log('🎙️ Voicemail recording received:', {
      RecordingSid: params.RecordingSid,
      CallSid: params.CallSid,
      RecordingDuration: params.RecordingDuration,
      From: params.From,
      To: params.To,
    });

    // Validate webhook signature for security
    const signature = req.headers.get('x-twilio-signature');
    if (signature) {
      const url = req.url;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (authToken) {
        const isValid = twilio.validateRequest(authToken, signature, url, params);

        if (!isValid) {
          console.error('⚠️ Invalid Twilio signature on voicemail webhook');
          return NextResponse.json(
            { error: 'Invalid signature' },
            { status: 403 }
          );
        }
      }
    }

    if (!supabaseAdmin) {
      console.error('Supabase admin client not configured');
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const recordingSid = params.RecordingSid;
    const callSid = params.CallSid;
    const recordingDuration = params.RecordingDuration ? parseInt(params.RecordingDuration) : null;
    const recordingUrl = params.RecordingUrl;
    const from = params.From;
    const to = params.To;

    if (!recordingSid || !callSid) {
      console.error('Missing RecordingSid or CallSid in callback');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find the call record to get user_id
    const { data: callData, error: callError } = await supabaseAdmin
      .from('twilio_calls')
      .select('user_id')
      .eq('call_sid', callSid)
      .single();

    if (callError || !callData) {
      console.error('Call not found in database:', callSid);
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const userId = callData.user_id;

    // Download and store voicemail
    let storedVoicemailUrl = recordingUrl;

    try {
      // Download recording from Twilio
      const accountSid = params.AccountSid;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

      if (accountSid && twilioAuthToken && recordingUrl) {
        // Fetch recording audio
        const audioUrl = `${recordingUrl}.mp3`;
        const audioResponse = await fetch(audioUrl, {
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${twilioAuthToken}`).toString('base64'),
          },
        });

        if (audioResponse.ok) {
          const audioBuffer = await audioResponse.arrayBuffer();
          const audioBytes = new Uint8Array(audioBuffer);

          // Upload to Supabase Storage
          const fileName = `${recordingSid}.mp3`;
          const filePath = `voicemails/${userId}/${fileName}`;

          const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('voicemails')
            .upload(filePath, audioBytes, {
              contentType: 'audio/mpeg',
              upsert: false,
            });

          if (!uploadError) {
            // Get public URL
            const { data: publicUrlData } = supabaseAdmin
              .storage
              .from('voicemails')
              .getPublicUrl(filePath);

            storedVoicemailUrl = publicUrlData.publicUrl;
            console.log(`✅ Voicemail uploaded: ${filePath}`);
          } else {
            console.error('Error uploading voicemail:', uploadError);
          }
        } else {
          console.error('Failed to download voicemail:', audioResponse.statusText);
        }
      }
    } catch (error: any) {
      console.error('Error downloading/storing voicemail:', error);
      // Continue with Twilio URL as fallback
    }

    // Save voicemail record
    const { error: insertError } = await supabaseAdmin
      .from('voicemails')
      .insert({
        user_id: userId,
        call_sid: callSid,
        recording_sid: recordingSid,
        from_number: from,
        to_number: to,
        duration: recordingDuration,
        recording_url: storedVoicemailUrl,
        status: 'new',
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error saving voicemail record:', insertError);
    } else {
      console.log(`✅ Saved voicemail from ${from} to ${to}`);
    }

    // Update call record with voicemail flag
    await supabaseAdmin
      .from('twilio_calls')
      .update({
        has_voicemail: true,
        voicemail_duration: recordingDuration,
        updated_at: new Date().toISOString(),
      })
      .eq('call_sid', callSid);

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Voicemail recording callback error:', error);
    return NextResponse.json(
      { error: error.message || 'Voicemail callback handler failed' },
      { status: 500 }
    );
  }
}
