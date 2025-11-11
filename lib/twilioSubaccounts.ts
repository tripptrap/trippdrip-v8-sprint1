// Twilio Subaccount Management for Multi-Tenant Architecture
import twilio from 'twilio';
import { createClient } from '@/lib/supabase/server';

// Initialize Twilio client with master account credentials
const masterAccountSid = process.env.TWILIO_ACCOUNT_SID;
const masterAuthToken = process.env.TWILIO_AUTH_TOKEN;

if (!masterAccountSid || !masterAuthToken) {
  console.warn('⚠️ Twilio master account credentials not configured.');
}

let masterClient: twilio.Twilio | null = null;

if (masterAccountSid && masterAuthToken) {
  masterClient = twilio(masterAccountSid, masterAuthToken);
}

export interface CreateSubaccountParams {
  userId: string;
  userEmail: string;
  userName?: string;
}

export interface CreateSubaccountResult {
  success: boolean;
  subaccountSid?: string;
  authToken?: string;
  error?: string;
  friendlyName?: string;
}

export interface GetUserCredentialsResult {
  success: boolean;
  accountSid?: string;
  authToken?: string;
  error?: string;
  status?: string;
}

/**
 * Create a Twilio subaccount for a user
 * This is called when a user purchases a membership
 */
export async function createTwilioSubaccount(
  params: CreateSubaccountParams
): Promise<CreateSubaccountResult> {
  const { userId, userEmail, userName } = params;

  if (!masterClient) {
    return {
      success: false,
      error: 'Twilio master account not configured',
    };
  }

  try {
    // Create a friendly name for the subaccount
    const friendlyName = userName
      ? `${userName} (${userEmail})`
      : userEmail;

    console.log(`📱 Creating Twilio subaccount for user ${userId}...`);

    // Create the subaccount using Twilio API
    const subaccount = await masterClient.api.accounts.create({
      friendlyName: friendlyName,
    });

    console.log(`✅ Subaccount created: ${subaccount.sid}`);

    // Get the auth token for the subaccount
    const authToken = subaccount.authToken;

    // Store credentials in database
    const supabase = await createClient();

    // Note: In production, you should encrypt the auth token before storing
    // For now, storing as-is but the column is named _encrypted for future implementation
    const { error: updateError } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        twilio_subaccount_sid: subaccount.sid,
        twilio_subaccount_auth_token_encrypted: authToken,
        twilio_subaccount_status: 'active',
        twilio_subaccount_created_at: new Date().toISOString(),
        twilio_subaccount_friendly_name: friendlyName,
      }, {
        onConflict: 'user_id'
      });

    if (updateError) {
      console.error('❌ Error storing subaccount credentials:', updateError);
      return {
        success: false,
        error: 'Failed to store subaccount credentials',
      };
    }

    return {
      success: true,
      subaccountSid: subaccount.sid,
      authToken: authToken,
      friendlyName: friendlyName,
    };
  } catch (error: any) {
    console.error('❌ Error creating Twilio subaccount:', error);
    return {
      success: false,
      error: error.message || 'Failed to create Twilio subaccount',
    };
  }
}

/**
 * Get user's Twilio subaccount credentials from database
 * This is used when sending SMS to use user-specific credentials
 */
export async function getUserTwilioCredentials(
  userId: string
): Promise<GetUserCredentialsResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_preferences')
      .select('twilio_subaccount_sid, twilio_subaccount_auth_token_encrypted, twilio_subaccount_status')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return {
        success: false,
        error: 'No Twilio subaccount found for this user',
      };
    }

    if (data.twilio_subaccount_status !== 'active') {
      return {
        success: false,
        error: `Twilio subaccount is ${data.twilio_subaccount_status}`,
        status: data.twilio_subaccount_status,
      };
    }

    return {
      success: true,
      accountSid: data.twilio_subaccount_sid,
      authToken: data.twilio_subaccount_auth_token_encrypted,
      status: data.twilio_subaccount_status,
    };
  } catch (error: any) {
    console.error('❌ Error fetching user Twilio credentials:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch credentials',
    };
  }
}

/**
 * Get user's Twilio phone numbers
 */
export async function getUserTwilioNumbers(userId: string) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_twilio_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching user Twilio numbers:', error);
      return {
        success: false,
        error: error.message,
        numbers: [],
      };
    }

    return {
      success: true,
      numbers: data || [],
    };
  } catch (error: any) {
    console.error('❌ Error fetching user Twilio numbers:', error);
    return {
      success: false,
      error: error.message,
      numbers: [],
    };
  }
}

/**
 * Check if user has a Twilio subaccount
 */
export async function userHasSubaccount(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_preferences')
      .select('twilio_subaccount_sid, twilio_subaccount_status')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return !!(data.twilio_subaccount_sid && data.twilio_subaccount_status === 'active');
  } catch (error) {
    return false;
  }
}

/**
 * Suspend a user's Twilio subaccount
 */
export async function suspendTwilioSubaccount(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('user_preferences')
      .update({
        twilio_subaccount_status: 'suspended',
      })
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Error suspending subaccount:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`⚠️ Suspended Twilio subaccount for user ${userId}`);

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('❌ Error suspending subaccount:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Reactivate a user's Twilio subaccount
 */
export async function reactivateTwilioSubaccount(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('user_preferences')
      .update({
        twilio_subaccount_status: 'active',
      })
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Error reactivating subaccount:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`✅ Reactivated Twilio subaccount for user ${userId}`);

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('❌ Error reactivating subaccount:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
