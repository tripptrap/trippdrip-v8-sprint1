// Script to provision Twilio subaccounts for all paid users who don't have one
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

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

async function provisionSubaccount(userId, userEmail, userName = '') {
  try {
    const friendlyName = userName ? `${userName} (${userEmail})` : userEmail;

    console.log(`\n📱 Provisioning Twilio subaccount for ${userEmail}...`);

    // Check if user already has a subaccount
    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('twilio_subaccount_sid, twilio_subaccount_status')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefData?.twilio_subaccount_sid && prefData.twilio_subaccount_status === 'active') {
      console.log(`✅ Already has active subaccount: ${prefData.twilio_subaccount_sid}`);
      return { success: true, skipped: true };
    }

    // Create Twilio subaccount
    console.log('🔄 Creating Twilio subaccount...');
    const subaccount = await twilioClient.api.accounts.create({
      friendlyName: friendlyName,
    });

    console.log(`✅ Subaccount created: ${subaccount.sid}`);

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
      return { success: false, error: updateError.message };
    }

    console.log('✅ Successfully provisioned!');
    return {
      success: true,
      subaccountSid: subaccount.sid,
      friendlyName: friendlyName
    };
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function provisionAllUsers() {
  console.log('🚀 Starting batch Twilio subaccount provisioning...\n');
  console.log('='.repeat(60));

  // Get all paid users
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, subscription_tier')
    .neq('subscription_tier', 'free')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching users:', error.message);
    return;
  }

  console.log(`Found ${users.length} paid users\n`);

  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  for (const user of users) {
    const result = await provisionSubaccount(user.id, user.email);

    if (result.success) {
      if (result.skipped) {
        results.skipped++;
      } else {
        results.success++;
      }
    } else {
      results.failed++;
      results.errors.push({
        email: user.email,
        error: result.error
      });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 SUMMARY:');
  console.log(`✅ Successfully provisioned: ${results.success}`);
  console.log(`⏭️  Skipped (already had): ${results.skipped}`);
  console.log(`❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(e => {
      console.log(`  - ${e.email}: ${e.error}`);
    });
  }

  console.log('\n✨ Done!');
}

provisionAllUsers();
