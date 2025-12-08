// Twilio Subaccount Management for Multi-Tenant Architecture
import twilio from 'twilio';
import { createClient } from '@/lib/supabase/server';
import { encrypt, safeDecrypt } from '@/lib/encryption';

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
  phoneNumber?: string;
  phoneSid?: string;
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

    // Store credentials in database with encryption
    const supabase = await createClient();

    // Encrypt the auth token before storing
    const encryptedAuthToken = encrypt(authToken);

    const { error: updateError } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        twilio_subaccount_sid: subaccount.sid,
        twilio_subaccount_auth_token_encrypted: encryptedAuthToken,
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

    // Auto-purchase a phone number for the new subaccount
    console.log(`📞 Auto-purchasing phone number for ${userEmail}...`);

    let purchasedNumber = null;
    let purchasedSid = null;

    try {
      // Use the subaccount client to purchase a number
      const subaccountClient = twilio(subaccount.sid, authToken);

      // Search for available local numbers (trying a few common area codes)
      const areaCodesToTry = [415, 646, 213, 305, 512, 720];
      let availableNumbers = null;

      for (const areaCode of areaCodesToTry) {
        try {
          const numbers = await subaccountClient.availablePhoneNumbers('US')
            .local
            .list({ areaCode, limit: 1 });

          if (numbers && numbers.length > 0) {
            availableNumbers = numbers;
            console.log(`✅ Found available number in area code ${areaCode}`);
            break;
          }
        } catch (err) {
          console.log(`⏭️  No numbers in area code ${areaCode}, trying next...`);
          continue;
        }
      }

      if (!availableNumbers || availableNumbers.length === 0) {
        // Try without area code filter
        availableNumbers = await subaccountClient.availablePhoneNumbers('US')
          .local
          .list({ limit: 1 });
      }

      if (availableNumbers && availableNumbers.length > 0) {
        const numberToPurchase = availableNumbers[0].phoneNumber;

        // Configure webhook URLs
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.hyvewyre.com';
        const smsWebhookUrl = `${siteUrl}/api/twilio/sms-webhook`;
        const statusCallbackUrl = `${siteUrl}/api/twilio/status-callback`;
        const voiceWebhookUrl = `${siteUrl}/api/twilio/voice-webhook`;

        // Purchase the number with all webhooks configured
        const purchasedPhoneNumber = await subaccountClient.incomingPhoneNumbers.create({
          phoneNumber: numberToPurchase,
          smsUrl: smsWebhookUrl,
          smsMethod: 'POST',
          statusCallback: statusCallbackUrl,
          statusCallbackMethod: 'POST',
          voiceUrl: voiceWebhookUrl,
          voiceMethod: 'POST',
        });

        purchasedNumber = purchasedPhoneNumber.phoneNumber;
        purchasedSid = purchasedPhoneNumber.sid;

        console.log(`✅ Auto-purchased number: ${purchasedNumber} (${purchasedSid})`);

        // Save the purchased number to the database
        const { error: numberError } = await supabase
          .from('user_twilio_numbers')
          .insert({
            user_id: userId,
            phone_number: purchasedNumber,
            phone_sid: purchasedSid,
            friendly_name: purchasedNumber,
            capabilities: {
              voice: purchasedPhoneNumber.capabilities?.voice || false,
              sms: purchasedPhoneNumber.capabilities?.sms || false,
              mms: purchasedPhoneNumber.capabilities?.mms || false,
              rcs: false
            },
            is_primary: true, // First number is primary
            status: 'active',
            purchased_at: new Date().toISOString()
          });

        if (numberError) {
          console.error('❌ Error saving auto-purchased number:', numberError);
        } else {
          console.log(`✅ Saved auto-purchased number to database`);
        }
      } else {
        console.log('⚠️  No available numbers found for auto-purchase');
      }
    } catch (purchaseError: any) {
      console.error('⚠️  Could not auto-purchase number:', purchaseError.message);
      // Don't fail the entire subaccount creation if number purchase fails
    }

    return {
      success: true,
      subaccountSid: subaccount.sid,
      authToken: authToken,
      friendlyName: friendlyName,
      phoneNumber: purchasedNumber || undefined,
      phoneSid: purchasedSid || undefined,
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

    // Decrypt the auth token (safeDecrypt handles both encrypted and legacy unencrypted values)
    const decryptedAuthToken = safeDecrypt(data.twilio_subaccount_auth_token_encrypted);

    return {
      success: true,
      accountSid: data.twilio_subaccount_sid,
      authToken: decryptedAuthToken,
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
