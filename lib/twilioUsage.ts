// Twilio Usage Tracking Library
// Fetch and process Twilio subaccount usage for billing

import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Master Twilio client
const masterAccountSid = process.env.TWILIO_ACCOUNT_SID;
const masterAuthToken = process.env.TWILIO_AUTH_TOKEN;

let masterClient: twilio.Twilio | null = null;
if (masterAccountSid && masterAuthToken) {
  masterClient = twilio(masterAccountSid, masterAuthToken);
}

export interface UsageRecord {
  category: string;
  description: string;
  count: number;
  price: string;
  priceUnit: string;
  startDate: Date;
  endDate: Date;
}

export interface SubaccountUsageSummary {
  userId: string;
  subaccountSid: string;
  periodStart: Date;
  periodEnd: Date;
  smsCount: number;
  smsCost: number;
  mmsCount: number;
  mmsCost: number;
  callCount: number;
  callCost: number;
  phoneNumberCost: number;
  totalCost: number;
  rawUsageData: any[];
}

export interface FetchUsageParams {
  subaccountSid: string;
  subaccountAuthToken: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Fetch usage records from a Twilio subaccount
 */
export async function fetchSubaccountUsage(
  params: FetchUsageParams
): Promise<{ success: boolean; usage?: UsageRecord[]; error?: string }> {
  const { subaccountSid, subaccountAuthToken, startDate, endDate } = params;

  try {
    // Create client for the subaccount
    const subaccountClient = twilio(subaccountSid, subaccountAuthToken);

    console.log(`📊 Fetching usage for subaccount ${subaccountSid} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Fetch all usage records for the period
    const usageRecords = await subaccountClient.usage.records.list({
      startDate,
      endDate,
    });

    const formattedRecords: UsageRecord[] = usageRecords.map((record) => ({
      category: record.category,
      description: record.description,
      count: parseInt(record.count, 10) || 0,
      price: record.price,
      priceUnit: record.priceUnit,
      startDate: new Date(record.startDate),
      endDate: new Date(record.endDate),
    }));

    return {
      success: true,
      usage: formattedRecords,
    };
  } catch (error: any) {
    console.error('❌ Error fetching Twilio usage:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch usage',
    };
  }
}

/**
 * Calculate usage summary from raw usage records
 */
export function calculateUsageSummary(
  usageRecords: UsageRecord[],
  userId: string,
  subaccountSid: string,
  periodStart: Date,
  periodEnd: Date
): SubaccountUsageSummary {
  const summary: SubaccountUsageSummary = {
    userId,
    subaccountSid,
    periodStart,
    periodEnd,
    smsCount: 0,
    smsCost: 0,
    mmsCount: 0,
    mmsCost: 0,
    callCount: 0,
    callCost: 0,
    phoneNumberCost: 0,
    totalCost: 0,
    rawUsageData: usageRecords,
  };

  for (const record of usageRecords) {
    const price = parseFloat(record.price) || 0;
    const count = record.count || 0;

    // SMS usage
    if (record.category === 'sms' || record.category === 'sms-outbound' || record.category === 'sms-inbound') {
      summary.smsCount += count;
      summary.smsCost += price;
    }
    // MMS usage
    else if (record.category === 'mms' || record.category === 'mms-outbound' || record.category === 'mms-inbound') {
      summary.mmsCount += count;
      summary.mmsCost += price;
    }
    // Call usage
    else if (record.category.includes('call') || record.category.includes('voice')) {
      summary.callCount += count;
      summary.callCost += price;
    }
    // Phone number costs
    else if (record.category.includes('phonenumber') || record.category.includes('phone-number')) {
      summary.phoneNumberCost += price;
    }

    // Add to total
    summary.totalCost += price;
  }

  // Round to 4 decimal places
  summary.smsCost = Math.round(summary.smsCost * 10000) / 10000;
  summary.mmsCost = Math.round(summary.mmsCost * 10000) / 10000;
  summary.callCost = Math.round(summary.callCost * 10000) / 10000;
  summary.phoneNumberCost = Math.round(summary.phoneNumberCost * 10000) / 10000;
  summary.totalCost = Math.round(summary.totalCost * 10000) / 10000;

  return summary;
}

/**
 * Store usage record in database
 */
export async function storeUsageRecord(
  summary: SubaccountUsageSummary
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('twilio_usage_records')
      .upsert(
        {
          user_id: summary.userId,
          subaccount_sid: summary.subaccountSid,
          period_start: summary.periodStart.toISOString(),
          period_end: summary.periodEnd.toISOString(),
          sms_count: summary.smsCount,
          sms_cost: summary.smsCost,
          mms_count: summary.mmsCount,
          mms_cost: summary.mmsCost,
          call_count: summary.callCount,
          call_cost: summary.callCost,
          phone_number_cost: summary.phoneNumberCost,
          total_cost: summary.totalCost,
          usage_data: summary.rawUsageData,
          billing_status: 'pending',
        },
        {
          onConflict: 'user_id,period_start,period_end',
        }
      )
      .select('id')
      .single();

    if (error) {
      console.error('❌ Error storing usage record:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Stored usage record for user ${summary.userId}: $${summary.totalCost}`);
    return { success: true, recordId: data.id };
  } catch (error: any) {
    console.error('❌ Error storing usage record:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all users with active Twilio subaccounts
 */
export async function getUsersWithSubaccounts(): Promise<
  Array<{
    userId: string;
    email: string;
    subaccountSid: string;
    subaccountAuthToken: string;
  }>
> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('user_id, twilio_subaccount_sid, twilio_subaccount_auth_token_encrypted')
      .eq('twilio_subaccount_status', 'active')
      .not('twilio_subaccount_sid', 'is', null)
      .not('twilio_subaccount_auth_token_encrypted', 'is', null);

    if (error) {
      console.error('❌ Error fetching users with subaccounts:', error);
      return [];
    }

    // Fetch user emails
    const usersWithEmails = await Promise.all(
      data.map(async (pref) => {
        const { data: userData } = await supabase.auth.admin.getUserById(pref.user_id);
        return {
          userId: pref.user_id,
          email: userData.user?.email || '',
          subaccountSid: pref.twilio_subaccount_sid,
          subaccountAuthToken: pref.twilio_subaccount_auth_token_encrypted,
        };
      })
    );

    return usersWithEmails.filter((u) => u.subaccountSid && u.subaccountAuthToken);
  } catch (error: any) {
    console.error('❌ Error fetching users with subaccounts:', error);
    return [];
  }
}

/**
 * Process usage for all subaccounts for a given period
 */
export async function processAllSubaccountUsage(
  periodStart: Date,
  periodEnd: Date
): Promise<{
  success: boolean;
  processed: number;
  failed: number;
  totalCost: number;
  errors: string[];
}> {
  const result = {
    success: true,
    processed: 0,
    failed: 0,
    totalCost: 0,
    errors: [] as string[],
  };

  console.log(`📊 Processing usage for all subaccounts from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

  const users = await getUsersWithSubaccounts();
  console.log(`👥 Found ${users.length} users with active subaccounts`);

  for (const user of users) {
    try {
      console.log(`\n📱 Processing usage for user: ${user.email} (${user.userId})`);

      // Fetch usage
      const usageResult = await fetchSubaccountUsage({
        subaccountSid: user.subaccountSid,
        subaccountAuthToken: user.subaccountAuthToken,
        startDate: periodStart,
        endDate: periodEnd,
      });

      if (!usageResult.success || !usageResult.usage) {
        result.failed++;
        result.errors.push(`Failed to fetch usage for ${user.email}: ${usageResult.error}`);
        continue;
      }

      // Calculate summary
      const summary = calculateUsageSummary(
        usageResult.usage,
        user.userId,
        user.subaccountSid,
        periodStart,
        periodEnd
      );

      console.log(`💰 Total cost for ${user.email}: $${summary.totalCost} (${summary.smsCount} SMS, ${summary.mmsCount} MMS)`);

      // Store in database
      const storeResult = await storeUsageRecord(summary);

      if (!storeResult.success) {
        result.failed++;
        result.errors.push(`Failed to store usage for ${user.email}: ${storeResult.error}`);
        continue;
      }

      result.processed++;
      result.totalCost += summary.totalCost;
    } catch (error: any) {
      result.failed++;
      result.errors.push(`Error processing ${user.email}: ${error.message}`);
      console.error(`❌ Error processing user ${user.email}:`, error);
    }
  }

  console.log(`\n✅ Processed ${result.processed} users, ${result.failed} failed`);
  console.log(`💰 Total usage cost: $${result.totalCost.toFixed(4)}`);

  return result;
}
