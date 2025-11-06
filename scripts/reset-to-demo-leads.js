const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

// Demo leads only
const demoLeads = [
  {
    id: "demo_lead_1",
    first_name: "Sarah",
    last_name: "Johnson",
    email: "sarah.johnson@example.com",
    phone: "+15551234567",
    state: "CA",
    tags: ["hot-lead", "interested", "demo"],
    status: "active",
    disposition: "qualified",
    score: 85,
    temperature: "hot",
    last_engaged: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    response_rate: 0.8,
    total_sent: 10,
    total_received: 8,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "demo_lead_2",
    first_name: "Michael",
    last_name: "Rodriguez",
    email: "m.rodriguez@example.com",
    phone: "+15559876543",
    state: "TX",
    tags: ["callback", "demo"],
    status: "active",
    disposition: "callback",
    score: 65,
    temperature: "warm",
    last_engaged: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    response_rate: 0.6,
    total_sent: 5,
    total_received: 3,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "demo_lead_3",
    first_name: "Jennifer",
    last_name: "Chen",
    email: "jennifer.chen@example.com",
    phone: "+15555551234",
    state: "NY",
    tags: ["sold", "demo", "vip"],
    status: "sold",
    disposition: "sold",
    score: 95,
    temperature: "hot",
    last_engaged: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    response_rate: 0.9,
    total_sent: 12,
    total_received: 11,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "demo_lead_4",
    first_name: "David",
    last_name: "Thompson",
    email: "david.t@example.com",
    phone: "+15554443333",
    state: "FL",
    tags: ["demo"],
    status: "archived",
    disposition: "not_interested",
    score: 15,
    temperature: "cold",
    last_engaged: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    response_rate: 0.2,
    total_sent: 5,
    total_received: 1,
    created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "demo_lead_5",
    first_name: "Emily",
    last_name: "Martinez",
    email: "emily.martinez@example.com",
    phone: "+15552223333",
    state: "WA",
    tags: ["nurture", "follow-up", "demo"],
    status: "active",
    disposition: "nurture",
    score: 45,
    temperature: "warm",
    last_engaged: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    response_rate: 0.5,
    total_sent: 8,
    total_received: 4,
    created_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "demo_lead_6",
    first_name: "Robert",
    last_name: "Anderson",
    email: "robert.anderson@example.com",
    phone: "+15556667777",
    state: "IL",
    tags: ["high-priority", "demo"],
    status: "active",
    disposition: "qualified",
    score: 78,
    temperature: "hot",
    last_engaged: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    response_rate: 0.75,
    total_sent: 8,
    total_received: 6,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Replace leads.json with only demo leads
fs.writeFileSync(path.join(dataDir, 'leads.json'), JSON.stringify(demoLeads, null, 2));

console.log('✅ Leads reset successfully!');
console.log(`- Kept only ${demoLeads.length} demo leads`);
console.log('- All uploaded leads have been removed');
console.log('\nDemo leads:');
console.log('  - Sarah Johnson (hot lead, qualified)');
console.log('  - Michael Rodriguez (warm lead, callback)');
console.log('  - Jennifer Chen (sold, VIP)');
console.log('  - David Thompson (cold, not interested)');
console.log('  - Emily Martinez (warm, nurture)');
console.log('  - Robert Anderson (hot, qualified)');
