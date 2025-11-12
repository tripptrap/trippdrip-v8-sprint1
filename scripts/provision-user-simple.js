// Simple script to provision Twilio subaccount
// Usage: node scripts/provision-user-simple.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

const userId = '36a47e0f-cda2-4646-b7b3-7d7533b799f5';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function provisionSubaccount() {
  try {
    console.log(`📱 Provisioning Twilio subaccount for user ${userId}...`);

    // Get user details
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !userData.user) {
      console.error('❌ Error fetching user:', userError);
      return;
    }

    const userEmail = userData.user.email || '';
    const userName = userData.user.user_metadata?.full_name || '';
    const friendlyName = userName ? `${userName} (${userEmail})` : userEmail;

    console.log(`👤 User: ${userName || 'No name'} (${userEmail})`);

    // Check if user already has a subaccount
    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('twilio_subaccount_sid, twilio_subaccount_status')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefData?.twilio_subaccount_sid && prefData.twilio_subaccount_status === 'active') {
      console.log(`✅ User already has an active subaccount: ${prefData.twilio_subaccount_sid}`);
      return;
    }

    // Create Twilio subaccount
    console.log('🔄 Creating Twilio subaccount...');
    const subaccount = await twilioClient.api.accounts.create({
      friendlyName: friendlyName,
    });

    console.log(`✅ Subaccount created: ${subaccount.sid}`);
    console.log(`   Auth Token: ${subaccount.authToken}`);

    // Store credentials in database
    console.log('💾 Storing credentials in database...');
    const { error: updateError } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        twilio_subaccount_sid: subaccount.sid,
        twilio_subaccount_auth_token_encrypted: subaccount.authToken,
        twilio_subaccount_status: 'active',
        twilio_subaccount_created_at: new Date().toISOString(),
        twilio_subaccount_friendly_name: friendlyName,
      }, {
        onConflict: 'user_id'
      });

    if (updateError) {
      console.error('❌ Error storing subaccount credentials:', updateError);
      return;
    }

    console.log('✅ Successfully provisioned Twilio subaccount!');
    console.log(`   Subaccount SID: ${subaccount.sid}`);
    console.log(`   Friendly Name: ${friendlyName}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

provisionSubaccount();
