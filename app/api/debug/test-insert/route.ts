// DEBUG: Test message insert to find what's failing
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'No supabaseAdmin' }, { status: 500 });
  }

  // Try to insert a test message
  // Table uses: from_phone, to_phone, content (NOT NULL), body
  const testMessage = {
    thread_id: '7376e8a9-faff-439f-a776-c017c41c7867', // The test thread
    from_phone: '+1234567890',
    to_phone: '+14079513717',
    body: 'TEST MESSAGE - DELETE ME',
    content: 'TEST MESSAGE - DELETE ME', // content has NOT NULL constraint
    direction: 'outbound',
    status: 'sent',
    message_sid: 'test-' + Date.now(),
    num_media: 0,
    media_urls: null,
    channel: 'sms',
    provider: 'test',
    created_at: new Date().toISOString(),
  };

  console.log('Attempting to insert:', testMessage);

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert(testMessage)
    .select();

  if (error) {
    console.error('Insert error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      testMessage
    });
  }

  // Now try to read it back
  const { data: readBack, error: readError } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('message_sid', testMessage.message_sid)
    .single();

  return NextResponse.json({
    success: true,
    inserted: data,
    readBack,
    readError: readError?.message
  });
}
