// Script to manually provision Twilio subaccount for a user
// Usage: node scripts/provision-subaccount.js <userId>

const { createClient } = require('@supabase/supabase-js');
const { createTwilioSubaccount } = require('../lib/twilioSubaccounts');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function provisionSubaccount(userId) {
  try {
    console.log(`📱 Provisioning Twilio subaccount for user ${userId}...`);

    // Get user details
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !userData.user) {
      console.error('❌ Error fetching user:', userError);
      process.exit(1);
    }

    const userEmail = userData.user.email || '';
    const userName = userData.user.user_metadata?.full_name || '';

    console.log(`👤 User: ${userName} (${userEmail})`);

    // Check if user already has a subaccount
    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('twilio_subaccount_sid, twilio_subaccount_status')
      .eq('user_id', userId)
      .single();

    if (prefData?.twilio_subaccount_sid && prefData.twilio_subaccount_status === 'active') {
      console.log(`✅ User already has an active subaccount: ${prefData.twilio_subaccount_sid}`);
      process.exit(0);
    }

    // Create Twilio subaccount
    const subaccountResult = await createTwilioSubaccount({
      userId,
      userEmail,
      userName,
    });

    if (!subaccountResult.success) {
      console.error('❌ Failed to create subaccount:', subaccountResult.error);
      process.exit(1);
    }

    console.log(`✅ Successfully created Twilio subaccount: ${subaccountResult.subaccountSid}`);
    console.log(`   Friendly Name: ${subaccountResult.friendlyName}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get userId from command line argument
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node scripts/provision-subaccount.js <userId>');
  process.exit(1);
}

provisionSubaccount(userId);
