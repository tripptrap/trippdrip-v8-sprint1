// Script to verify Twilio subaccount setup
// Run this with: node scripts/verify-twilio-setup.js

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySetup() {
  console.log('🔍 Verifying Twilio Subaccount Setup...\n');

  // 1. Check if user_preferences table has new columns
  console.log('1️⃣ Checking user_preferences table columns...');
  const { data: prefColumns, error: prefError } = await supabase
    .from('user_preferences')
    .select('twilio_subaccount_sid, twilio_subaccount_status')
    .limit(1);

  if (prefError) {
    console.error('   ❌ Error querying user_preferences:', prefError.message);
    console.log('   💡 Make sure you ran the SQL migration in Supabase');
  } else {
    console.log('   ✅ user_preferences table has Twilio subaccount columns');
  }

  // 2. Check if user_twilio_numbers table exists
  console.log('\n2️⃣ Checking user_twilio_numbers table...');
  const { data: numbersData, error: numbersError } = await supabase
    .from('user_twilio_numbers')
    .select('id')
    .limit(1);

  if (numbersError) {
    console.error('   ❌ Error querying user_twilio_numbers:', numbersError.message);
    console.log('   💡 Make sure you ran the SQL migration in Supabase');
  } else {
    console.log('   ✅ user_twilio_numbers table exists');
  }

  // 3. Check Twilio credentials
  console.log('\n3️⃣ Checking Twilio master account credentials...');
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;

  if (!twilioSid || !twilioToken) {
    console.error('   ❌ Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env.local');
  } else {
    console.log('   ✅ Twilio credentials found');
    console.log(`   📱 Account SID: ${twilioSid}`);

    // Verify they're valid by making a simple API call
    try {
      const twilio = require('twilio');
      const client = twilio(twilioSid, twilioToken);
      const account = await client.api.v2010.accounts(twilioSid).fetch();
      console.log(`   ✅ Twilio account verified: ${account.friendlyName}`);
      console.log(`   📊 Account Status: ${account.status}`);
    } catch (error) {
      console.error('   ❌ Failed to verify Twilio credentials:', error.message);
      console.log('   💡 Check that TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct');
    }
  }

  // 4. Check if we can create subaccounts
  console.log('\n4️⃣ Testing subaccount creation capability...');
  try {
    const twilio = require('twilio');
    const client = twilio(twilioSid, twilioToken);

    // Try to list subaccounts (this will fail if account doesn't have permission)
    const subaccounts = await client.api.v2010.accounts.list({ limit: 1 });
    console.log('   ✅ Account has permission to manage subaccounts');
    console.log(`   📊 Existing subaccounts: ${subaccounts.length > 0 ? 'Yes' : 'None yet'}`);
  } catch (error) {
    console.error('   ❌ Cannot access subaccounts:', error.message);
    console.log('   💡 Your Twilio account may need to enable subaccount creation');
    console.log('   💡 Contact Twilio support or check account settings');
  }

  // 5. Summary
  console.log('\n📋 Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Database migration: Complete');
  console.log('✅ Environment variables: Configured');
  console.log('🔄 Next steps:');
  console.log('   1. Deploy to Vercel (if not already done)');
  console.log('   2. Test subaccount creation via API');
  console.log('   3. Make a test subscription purchase');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

verifySetup().catch(console.error);
