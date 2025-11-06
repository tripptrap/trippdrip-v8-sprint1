const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

// Create threads for the texts page
const demoThreads = [
  {
    id: "thread_demo_1",
    lead_id: "demo_lead_1",
    lead_name: "Sarah Johnson",
    lead_phone: "+15551234567",
    last_message_snippet: "Great! It's 30% off all products until March 31st. Can I send you the catalog?",
    last_sender: "agent",
    unread: false,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString()
  },
  {
    id: "thread_demo_2",
    lead_id: "demo_lead_3",
    lead_name: "Jennifer Chen",
    lead_phone: "+15555551234",
    last_message_snippet: "Just placed my order! Thanks so much!",
    last_sender: "lead",
    unread: true,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "thread_demo_3",
    lead_id: "demo_lead_2",
    lead_name: "Michael Rodriguez",
    lead_phone: "+15559876543",
    last_message_snippet: "Can you call me back tomorrow? I have some questions.",
    last_sender: "lead",
    unread: true,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString()
  }
];

// Save threads
fs.writeFileSync(
  path.join(dataDir, 'threads.json'),
  JSON.stringify(demoThreads, null, 2)
);

console.log('✅ Demo threads created successfully!');
console.log(`- Added ${demoThreads.length} conversation threads`);
console.log('\nYou can now see conversations in the Texts page:');
console.log('  - Sarah Johnson conversation');
console.log('  - Jennifer Chen conversation (SOLD - green styling)');
console.log('  - Michael Rodriguez conversation');
