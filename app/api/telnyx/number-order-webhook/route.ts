// API Route: Telnyx Number Order Webhook
// Handles number provisioning status updates for local numbers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    const eventType = body?.data?.event_type;
    const payload = body?.data?.payload;

    console.log('📞 Telnyx number order webhook received:', {
      event_type: eventType,
      record_type: body?.data?.record_type,
    });

    if (!supabaseAdmin) {
      console.error('❌ Supabase admin client not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Handle different event types
    switch (eventType) {
      case 'number_order.complete': {
        // Number order completed successfully - number is ready to use
        const phoneNumbers = payload?.phone_numbers || [];
        const orderId = payload?.id;
        const userId = payload?.customer_reference; // We'll pass user_id as customer_reference when ordering

        console.log('✅ Number order complete:', {
          orderId,
          phoneNumbers: phoneNumbers.map((p: any) => p.phone_number),
          userId,
        });

        for (const phoneData of phoneNumbers) {
          const phoneNumber = phoneData?.phone_number;

          if (!phoneNumber) continue;

          // Check if we have a pending record for this number
          const { data: pendingNumber } = await supabaseAdmin
            .from('user_telnyx_numbers')
            .select('*')
            .eq('phone_number', phoneNumber)
            .eq('status', 'pending')
            .single();

          if (pendingNumber) {
            // Update existing pending record to active
            const { error: updateError } = await supabaseAdmin
              .from('user_telnyx_numbers')
              .update({
                status: 'active',
                telnyx_connection_id: phoneData?.connection_id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', pendingNumber.id);

            if (updateError) {
              console.error('❌ Error activating number:', updateError);
            } else {
              console.log(`✅ Number ${phoneNumber} activated for user ${pendingNumber.user_id}`);
            }
          } else if (userId) {
            // No pending record - create new one (shouldn't normally happen)
            const { error: insertError } = await supabaseAdmin
              .from('user_telnyx_numbers')
              .insert({
                user_id: userId,
                phone_number: phoneNumber,
                friendly_name: phoneData?.friendly_name || phoneNumber,
                status: 'active',
                telnyx_connection_id: phoneData?.connection_id,
              });

            if (insertError) {
              console.error('❌ Error inserting number:', insertError);
            } else {
              console.log(`✅ Number ${phoneNumber} added for user ${userId}`);
            }
          }
        }
        break;
      }

      case 'number_order.failed': {
        // Number order failed
        const phoneNumbers = payload?.phone_numbers || [];
        const orderId = payload?.id;
        const failureReason = payload?.failure_reason || 'Unknown reason';

        console.error('❌ Number order failed:', {
          orderId,
          reason: failureReason,
          phoneNumbers: phoneNumbers.map((p: any) => p.phone_number),
        });

        // Update any pending numbers to failed status
        for (const phoneData of phoneNumbers) {
          const phoneNumber = phoneData?.phone_number;
          if (!phoneNumber) continue;

          await supabaseAdmin
            .from('user_telnyx_numbers')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('phone_number', phoneNumber)
            .eq('status', 'pending');
        }
        break;
      }

      case 'phone_number.provisioned': {
        // Individual phone number provisioned
        const phoneNumber = payload?.phone_number;
        const connectionId = payload?.connection_id;

        console.log('✅ Phone number provisioned:', phoneNumber);

        if (phoneNumber) {
          // Update the number to active if it exists
          const { error } = await supabaseAdmin
            .from('user_telnyx_numbers')
            .update({
              status: 'active',
              telnyx_connection_id: connectionId,
              updated_at: new Date().toISOString(),
            })
            .eq('phone_number', phoneNumber)
            .eq('status', 'pending');

          if (error) {
            console.error('❌ Error updating provisioned number:', error);
          }
        }
        break;
      }

      case 'phone_number.deleted': {
        // Phone number was released/deleted
        const phoneNumber = payload?.phone_number;

        console.log('🗑️ Phone number deleted:', phoneNumber);

        if (phoneNumber) {
          await supabaseAdmin
            .from('user_telnyx_numbers')
            .update({
              status: 'inactive',
              updated_at: new Date().toISOString(),
            })
            .eq('phone_number', phoneNumber);
        }
        break;
      }

      case 'porting_order.status_changed': {
        // Number porting status changed
        const portingStatus = payload?.status;
        const phoneNumbers = payload?.phone_numbers || [];

        console.log('🔄 Porting order status changed:', {
          status: portingStatus,
          phoneNumbers,
        });

        if (portingStatus === 'ported' || portingStatus === 'completed') {
          // Porting complete - activate the numbers
          for (const phoneNumber of phoneNumbers) {
            await supabaseAdmin
              .from('user_telnyx_numbers')
              .update({
                status: 'active',
                updated_at: new Date().toISOString(),
              })
              .eq('phone_number', phoneNumber)
              .eq('status', 'pending');
          }
        }
        break;
      }

      default:
        console.log('ℹ️ Unhandled event type:', eventType);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true, event_type: eventType });

  } catch (error: any) {
    console.error('❌ Number order webhook error:', error);
    // Still return 200 to prevent Telnyx from retrying
    return NextResponse.json({ received: true, error: error.message });
  }
}

// Handle GET for webhook verification
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    webhook: 'telnyx-number-order',
    message: 'Webhook endpoint is active'
  });
}
