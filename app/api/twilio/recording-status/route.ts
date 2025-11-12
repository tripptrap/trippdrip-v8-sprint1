// API Route: Twilio Recording Status Callback
// Receives recording status updates and downloads recordings

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

    console.log('🎙️ Recording status update:', {
      RecordingSid: params.RecordingSid,
      RecordingStatus: params.RecordingStatus,
      CallSid: params.CallSid,
      RecordingDuration: params.RecordingDuration,
    });

    // Validate webhook signature for security
    const signature = req.headers.get('x-twilio-signature');
    if (signature) {
      const url = req.url;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (authToken) {
        const isValid = twilio.validateRequest(authToken, signature, url, params);

        if (!isValid) {
          console.error('⚠️ Invalid Twilio signature on recording webhook');
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
    const recordingStatus = params.RecordingStatus; // completed, absent, failed
    const callSid = params.CallSid;
    const recordingDuration = params.RecordingDuration ? parseInt(params.RecordingDuration) : null;
    const recordingUrl = params.RecordingUrl;

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

    // Download and store recording if completed
    let storedRecordingUrl = recordingUrl;

    if (recordingStatus === 'completed' && recordingUrl) {
      try {
        // Download recording from Twilio
        const accountSid = params.AccountSid;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

        if (accountSid && twilioAuthToken) {
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
            const filePath = `recordings/${userId}/${fileName}`;

            const { data: uploadData, error: uploadError } = await supabaseAdmin
              .storage
              .from('call-recordings')
              .upload(filePath, audioBytes, {
                contentType: 'audio/mpeg',
                upsert: false,
              });

            if (!uploadError) {
              // Get public URL
              const { data: publicUrlData } = supabaseAdmin
                .storage
                .from('call-recordings')
                .getPublicUrl(filePath);

              storedRecordingUrl = publicUrlData.publicUrl;
              console.log(`✅ Recording uploaded: ${filePath}`);
            } else {
              console.error('Error uploading recording:', uploadError);
            }
          } else {
            console.error('Failed to download recording:', audioResponse.statusText);
          }
        }
      } catch (error: any) {
        console.error('Error downloading/storing recording:', error);
        // Continue with Twilio URL as fallback
      }
    }

    // Update call record with recording info
    const { error: updateError } = await supabaseAdmin
      .from('twilio_calls')
      .update({
        recording_sid: recordingSid,
        recording_url: storedRecordingUrl,
        recording_duration: recordingDuration,
        recording_status: recordingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('call_sid', callSid);

    if (updateError) {
      console.error('Error updating call with recording info:', updateError);
    } else {
      console.log(`✅ Updated call ${callSid} with recording ${recordingSid}`);
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Recording status callback error:', error);
    return NextResponse.json(
      { error: error.message || 'Recording callback handler failed' },
      { status: 500 }
    );
  }
}
