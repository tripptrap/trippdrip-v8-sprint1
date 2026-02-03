// Script to add a verified number to the pool
// Usage: node scripts/add-number-to-pool.js +18555551234 PN123456789 tollfree

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addNumberToPool(phoneNumber, phoneSid, numberType = 'tollfree') {
  try {
    console.log(`\n📞 Adding ${phoneNumber} to the pool...`);

    // Validate number type
    if (!['local', 'tollfree'].includes(numberType)) {
      throw new Error('Number type must be "local" or "tollfree"');
    }

    // Insert into number_pool
    const { data, error } = await supabase
      .from('number_pool')
      .insert({
        phone_number: phoneNumber,
        phone_sid: phoneSid,
        friendly_name: `Pool ${numberType === 'tollfree' ? 'Toll-Free' : 'Local'} Number`,
        number_type: numberType,
        capabilities: {
          voice: true,
          sms: true,
          mms: true
        },
        is_verified: true, // Mark as verified
        verification_status: 'approved',
        verified_at: new Date().toISOString(),
        is_assigned: false,
        master_account_sid: process.env.TELNYX_API_KEY ? 'TELNYX' : 'MANUAL',
        monthly_cost: numberType === 'tollfree' ? 2.00 : 1.00,
        purchase_date: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error adding number to pool:', error);
      throw error;
    }

    console.log('✅ Successfully added to pool!');
    console.log('📋 Pool Number Details:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Phone: ${data.phone_number}`);
    console.log(`   Type: ${data.number_type}`);
    console.log(`   Verified: ${data.is_verified ? 'Yes' : 'No'}`);
    console.log(`   Monthly Cost: $${data.monthly_cost}`);
    console.log(`\n🎉 Users can now claim this number for instant messaging!`);

  } catch (error) {
    console.error('❌ Failed to add number:', error.message);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
📞 Add Number to Pool Script

Usage:
  node scripts/add-number-to-pool.js <phone_number> <phone_sid> [number_type]

Arguments:
  phone_number  - Phone number in E.164 format (e.g., +18555551234)
  phone_sid     - Telnyx Phone Number ID (e.g., 123456789...)
  number_type   - "tollfree" or "local" (default: tollfree)

Examples:
  node scripts/add-number-to-pool.js +18555551234 PN123456789 tollfree
  node scripts/add-number-to-pool.js +14155551234 PN987654321 local
`);
  process.exit(1);
}

const [phoneNumber, phoneSid, numberType = 'tollfree'] = args;

addNumberToPool(phoneNumber, phoneSid, numberType);
