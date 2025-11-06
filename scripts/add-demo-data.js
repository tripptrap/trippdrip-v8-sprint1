const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

// Read existing data
let leads = JSON.parse(fs.readFileSync(path.join(dataDir, 'leads.json'), 'utf-8'));
let campaigns = [];
let messages = [];

try {
  campaigns = JSON.parse(fs.readFileSync(path.join(dataDir, 'campaigns.json'), 'utf-8'));
} catch (e) {
  campaigns = [];
}

try {
  messages = JSON.parse(fs.readFileSync(path.join(dataDir, 'messages.json'), 'utf-8'));
} catch (e) {
  messages = [];
}

// Add demo leads with various statuses and dispositions
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
    last_engaged: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
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
    last_engaged: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
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
    last_engaged: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
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
    last_engaged: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days ago
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
    last_engaged: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
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
    last_engaged: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
    response_rate: 0.75,
    total_sent: 8,
    total_received: 6,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Add demo leads to the beginning of the array
demoLeads.forEach(lead => {
  // Remove any existing demo lead with same id
  leads = leads.filter(l => l.id !== lead.id);
  // Add to beginning
  leads.unshift(lead);
});

// Create demo campaigns
const demoCampaigns = [
  {
    id: "demo_campaign_1",
    user_id: "user_1",
    name: "Spring Sale 2025",
    description: "Promoting our spring sale to qualified leads",
    channel: "sms",
    message: "Hi {{first_name}}! Our Spring Sale is live with 30% off. Interested?",
    tags: ["demo"],
    lead_ids: ["demo_lead_1", "demo_lead_2", "demo_lead_3"],
    total_leads: 3,
    messages_sent: 3,
    messages_delivered: 3,
    messages_failed: 0,
    credits_used: 3,
    status: "completed",
    started_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "demo_campaign_2",
    user_id: "user_1",
    name: "Follow-up Campaign",
    description: "Following up with warm leads",
    channel: "sms",
    message: "Hey {{first_name}}, just checking in! Any questions about our service?",
    tags: ["demo", "follow-up"],
    lead_ids: ["demo_lead_2", "demo_lead_5"],
    total_leads: 2,
    messages_sent: 2,
    messages_delivered: 2,
    messages_failed: 0,
    credits_used: 2,
    status: "completed",
    started_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

demoCampaigns.forEach(campaign => {
  campaigns = campaigns.filter(c => c.id !== campaign.id);
  campaigns.unshift(campaign);
});

// Create demo messages
const demoMessages = [
  // Sarah Johnson conversation (hot lead)
  {
    id: "demo_msg_1",
    user_id: "user_1",
    lead_id: "demo_lead_1",
    channel: "sms",
    direction: "out",
    sender: "agent",
    body: "Hi Sarah! Our Spring Sale is live with 30% off. Interested?",
    status: "delivered",
    campaign_id: "demo_campaign_1",
    credits_cost: 1,
    segments: 1,
    media_count: 0,
    sent_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "demo_msg_2",
    user_id: "user_1",
    lead_id: "demo_lead_1",
    channel: "sms",
    direction: "in",
    sender: "lead",
    body: "Yes! Tell me more about this sale!",
    status: "delivered",
    credits_cost: 0,
    segments: 0,
    media_count: 0,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString()
  },
  {
    id: "demo_msg_3",
    user_id: "user_1",
    lead_id: "demo_lead_1",
    channel: "sms",
    direction: "out",
    sender: "agent",
    body: "Great! It's 30% off all products until March 31st. Can I send you the catalog?",
    status: "delivered",
    credits_cost: 1,
    segments: 1,
    media_count: 0,
    sent_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString()
  },
  // Jennifer Chen conversation (sold lead)
  {
    id: "demo_msg_4",
    user_id: "user_1",
    lead_id: "demo_lead_3",
    channel: "sms",
    direction: "out",
    sender: "agent",
    body: "Hi Jennifer! Our Spring Sale is live with 30% off. Interested?",
    status: "delivered",
    campaign_id: "demo_campaign_1",
    credits_cost: 1,
    segments: 1,
    media_count: 0,
    sent_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "demo_msg_5",
    user_id: "user_1",
    lead_id: "demo_lead_3",
    channel: "sms",
    direction: "in",
    sender: "lead",
    body: "Absolutely! I've been waiting for this!",
    status: "delivered",
    credits_cost: 0,
    segments: 0,
    media_count: 0,
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "demo_msg_6",
    user_id: "user_1",
    lead_id: "demo_lead_3",
    channel: "sms",
    direction: "out",
    sender: "agent",
    body: "Perfect! I'll send you the details right now.",
    status: "delivered",
    credits_cost: 1,
    segments: 1,
    media_count: 0,
    sent_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString()
  },
  {
    id: "demo_msg_7",
    user_id: "user_1",
    lead_id: "demo_lead_3",
    channel: "sms",
    direction: "in",
    sender: "lead",
    body: "Just placed my order! Thanks so much!",
    status: "delivered",
    credits_cost: 0,
    segments: 0,
    media_count: 0,
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
  },
  // Michael Rodriguez conversation (callback)
  {
    id: "demo_msg_8",
    user_id: "user_1",
    lead_id: "demo_lead_2",
    channel: "sms",
    direction: "out",
    sender: "agent",
    body: "Hey Michael, just checking in! Any questions about our service?",
    status: "delivered",
    campaign_id: "demo_campaign_2",
    credits_cost: 1,
    segments: 1,
    media_count: 0,
    sent_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "demo_msg_9",
    user_id: "user_1",
    lead_id: "demo_lead_2",
    channel: "sms",
    direction: "in",
    sender: "lead",
    body: "Can you call me back tomorrow? I have some questions.",
    status: "delivered",
    credits_cost: 0,
    segments: 0,
    media_count: 0,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString()
  }
];

demoMessages.forEach(msg => {
  messages = messages.filter(m => m.id !== msg.id);
  messages.unshift(msg);
});

// Save all data
fs.writeFileSync(path.join(dataDir, 'leads.json'), JSON.stringify(leads, null, 2));
fs.writeFileSync(path.join(dataDir, 'campaigns.json'), JSON.stringify(campaigns, null, 2));
fs.writeFileSync(path.join(dataDir, 'messages.json'), JSON.stringify(messages, null, 2));

console.log('✅ Demo data added successfully!');
console.log(`- Added ${demoLeads.length} demo leads`);
console.log(`- Added ${demoCampaigns.length} demo campaigns`);
console.log(`- Added ${demoMessages.length} demo messages`);
console.log('\nDemo leads include:');
console.log('  - Sarah Johnson (hot lead, qualified)');
console.log('  - Michael Rodriguez (warm lead, callback)');
console.log('  - Jennifer Chen (sold, VIP)');
console.log('  - David Thompson (cold, not interested)');
console.log('  - Emily Martinez (warm, nurture)');
console.log('  - Robert Anderson (hot, qualified)');
