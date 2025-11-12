// Cron job to process Twilio usage and create Stripe invoice items
// Runs monthly on the 1st day of each month

import { NextRequest, NextResponse } from 'next/server';
import { processAllSubaccountUsage } from '@/lib/twilioUsage';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error('❌ Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🕐 Starting Twilio usage processing cron job...');

    // Calculate previous month's date range
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const periodEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 23, 59, 59);

    console.log(`📅 Processing usage for: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Step 1: Fetch and store all usage records
    const usageResult = await processAllSubaccountUsage(periodStart, periodEnd);

    if (!usageResult.success || usageResult.failed > 0) {
      console.error(`⚠️ Some usage processing failed: ${usageResult.failed} failures`);
      console.error('Errors:', usageResult.errors);
    }

    console.log(`✅ Processed ${usageResult.processed} users`);
    console.log(`💰 Total usage cost: $${usageResult.totalCost.toFixed(4)}`);

    // Step 2: Create Stripe invoice items for all pending usage records
    const { data: pendingRecords, error: fetchError } = await supabase
      .from('twilio_usage_records')
      .select('*')
      .eq('billing_status', 'pending')
      .gte('period_start', periodStart.toISOString())
      .lte('period_end', periodEnd.toISOString());

    if (fetchError) {
      console.error('❌ Error fetching pending usage records:', fetchError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch pending records',
          usageProcessed: usageResult.processed,
        },
        { status: 500 }
      );
    }

    console.log(`💳 Creating Stripe invoice items for ${pendingRecords?.length || 0} records...`);

    let invoiceItemsCreated = 0;
    let invoiceItemsFailed = 0;
    const billingErrors: string[] = [];

    for (const record of pendingRecords || []) {
      try {
        // Skip if total cost is $0
        if (record.total_cost <= 0) {
          console.log(`⏭️ Skipping user ${record.user_id} - no usage`);
          await supabase
            .from('twilio_usage_records')
            .update({ billing_status: 'paid' })
            .eq('id', record.id);
          continue;
        }

        // Get user's Stripe customer ID
        const { data: userData } = await supabase.auth.admin.getUserById(record.user_id);
        const { data: prefData } = await supabase
          .from('user_preferences')
          .select('stripe_customer_id')
          .eq('user_id', record.user_id)
          .single();

        if (!prefData?.stripe_customer_id) {
          billingErrors.push(`No Stripe customer ID for user ${record.user_id}`);
          invoiceItemsFailed++;
          continue;
        }

        // Create invoice item in Stripe
        const periodLabel = new Date(record.period_start).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        });

        const description = `Twilio Usage - ${periodLabel}
SMS: ${record.sms_count} messages ($${record.sms_cost})
MMS: ${record.mms_count} messages ($${record.mms_cost})
Calls: ${record.call_count} minutes ($${record.call_cost})
Phone Numbers: $${record.phone_number_cost}`;

        const invoiceItem = await stripe.invoiceItems.create({
          customer: prefData.stripe_customer_id,
          amount: Math.round(record.total_cost * 100), // Convert to cents
          currency: 'usd',
          description: `Twilio Usage - ${periodLabel}`,
          metadata: {
            user_id: record.user_id,
            usage_record_id: record.id,
            period_start: record.period_start,
            period_end: record.period_end,
            sms_count: record.sms_count.toString(),
            sms_cost: record.sms_cost.toString(),
          },
        });

        console.log(`✅ Created invoice item for user ${userData.user?.email}: $${record.total_cost}`);

        // Update record with Stripe invoice item ID
        await supabase
          .from('twilio_usage_records')
          .update({
            billing_status: 'invoiced',
            stripe_invoice_item_id: invoiceItem.id,
          })
          .eq('id', record.id);

        invoiceItemsCreated++;
      } catch (error: any) {
        console.error(`❌ Failed to create invoice item for user ${record.user_id}:`, error);
        billingErrors.push(`Failed to bill user ${record.user_id}: ${error.message}`);
        invoiceItemsFailed++;
      }
    }

    console.log(`\n📊 Final Summary:`);
    console.log(`✅ Usage records processed: ${usageResult.processed}`);
    console.log(`❌ Usage processing failed: ${usageResult.failed}`);
    console.log(`💳 Invoice items created: ${invoiceItemsCreated}`);
    console.log(`❌ Invoice items failed: ${invoiceItemsFailed}`);
    console.log(`💰 Total billed: $${usageResult.totalCost.toFixed(4)}`);

    return NextResponse.json({
      success: true,
      usageProcessed: usageResult.processed,
      usageFailed: usageResult.failed,
      invoiceItemsCreated,
      invoiceItemsFailed,
      totalCost: usageResult.totalCost,
      errors: [...usageResult.errors, ...billingErrors],
    });
  } catch (error: any) {
    console.error('❌ Cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process usage',
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(req: NextRequest) {
  return GET(req);
}
