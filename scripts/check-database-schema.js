// Check current database schema
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkSchema() {
  console.log('📊 Checking database schema...\n');

  // Check for tables
  const { data: tables, error: tablesError } = await supabase
    .rpc('get_tables_info', {});

  if (tablesError) {
    console.log('Using alternative method to check tables...\n');

    // Check specific tables we care about
    const tablesToCheck = [
      'leads',
      'lead_activities',
      'sms_messages',
      'sms_templates',
      'sms_responses',
      'campaigns',
      'messages',
      'threads'
    ];

    for (const tableName of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(0);

        if (!error) {
          console.log(`✅ Table '${tableName}' exists`);

          // Get column info for this table
          const { data: cols, error: colError } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);

          if (cols && cols.length > 0) {
            console.log(`   Columns: ${Object.keys(cols[0]).join(', ')}`);
          } else if (cols && cols.length === 0) {
            console.log(`   Table is empty, checking schema differently...`);
          }
        } else if (error.code === '42P01') {
          console.log(`❌ Table '${tableName}' does NOT exist`);
        } else {
          console.log(`⚠️  Table '${tableName}': ${error.message}`);
        }
      } catch (e) {
        console.log(`⚠️  Error checking '${tableName}': ${e.message}`);
      }
      console.log('');
    }
  }

  // Specifically check lead_activities columns
  console.log('\n🔍 Checking lead_activities table in detail...');
  try {
    const { data, error } = await supabase
      .from('lead_activities')
      .select('*')
      .limit(1);

    if (data) {
      if (data.length > 0) {
        console.log('   Existing columns:', Object.keys(data[0]).join(', '));

        // Check for SMS-related columns
        const hasSmsMessageId = data[0].hasOwnProperty('sms_message_id');
        const hasSmsResponseId = data[0].hasOwnProperty('sms_response_id');

        console.log(`   - sms_message_id column: ${hasSmsMessageId ? '✅ EXISTS' : '❌ MISSING'}`);
        console.log(`   - sms_response_id column: ${hasSmsResponseId ? '✅ EXISTS' : '❌ MISSING'}`);
      } else {
        console.log('   Table exists but is empty. Cannot determine columns from data.');
        console.log('   Try adding a test record first, or check in Supabase dashboard.');
      }
    } else if (error) {
      console.log('   Error:', error.message);
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n✅ Schema check complete!');
}

checkSchema();
