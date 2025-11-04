# TrippDrip Codebase Quick Reference

## Critical File Locations

### Campaign Management
| Item | Location |
|------|----------|
| Campaign Page | `/app/campaigns/page.tsx` |
| Campaign API | `/app/api/campaigns/route.ts` |
| Execute Campaign API | `/app/api/campaigns/run/route.ts` |
| Campaign Store | `/lib/campaignsStore.ts` |
| Prisma Schema | `/prisma/schema.prisma` |

### Lead Management
| Item | Location |
|------|----------|
| Leads Page | `/app/leads/page.tsx` |
| Leads Table Component | `/components/leads/MainTable.tsx` |
| Get Leads API | `/app/api/leads/route.ts` |
| List Leads API | `/app/api/leads/list/route.ts` |
| Import Leads API | `/app/api/leads/import/route.ts` |
| Upsert Lead API | `/app/api/leads/upsert/route.ts` |
| Document Parse API | `/app/api/leads/upload-document/route.ts` |

### Messaging
| Item | Location |
|------|----------|
| Texts Page | `/app/texts/page.tsx` |
| Conversation Drawer | `/components/ConversationDrawer.tsx` |
| LocalStorage Store | `/lib/localStore.ts` |
| Store Operations | `/lib/storeOps.ts` |
| Message Status Icons | `/lib/storeOps.ts` (getMessageStatusIcon) |

### Data Storage
| Storage Type | Location |
|--------------|----------|
| Leads JSON | `/data/leads.json` |
| Campaigns JSON | `/data/campaigns.json` |
| Tags JSON | `/data/tags.json` |
| LocalStorage Key | `trippdrip.store.v1` |

---

## Key Data Types

### Lead
```typescript
{
  id: string;
  first_name: string;
  last_name: string;
  phone: string;          // E.164 format: +1234567890
  email: string;
  state: string;          // Two-letter state code
  tags: string[];         // Custom tags
  status: string;         // Default: "active"
  [key]: any;             // Additional custom fields
}
```

### Campaign
```typescript
{
  id: string;
  name: string;
  tags_applied: string[];
  lead_ids: string[];
  lead_count: number;
  messages_sent: number;
  created_at: ISO8601;
  updated_at: ISO8601;
}
```

### Message
```typescript
{
  id: number;
  thread_id: number;
  direction: 'in' | 'out';
  sender: 'agent' | 'lead' | 'ai';
  body: string;
  created_at: ISO8601;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  messageId?: string;     // Twilio SID
}
```

### Thread
```typescript
{
  id: number;
  lead_id: number;
  channel: 'sms' | 'email';
  last_message_snippet: string;
  last_sender: 'agent' | 'lead';
  unread: boolean;
  campaign_id?: number;
  updated_at: ISO8601;
}
```

---

## Message Status Display

| Status | Icon | Color | Meaning |
|--------|------|-------|---------|
| pending | ⏱ | gray | Queued for sending |
| sent | ✓ | blue-400 | Sent to Twilio |
| delivered | ✓✓ | blue-500 | Confirmed delivery |
| read | ✓✓ | blue-600 | Lead has read |
| failed | ✗ | red-500 | Send failed |

---

## API Endpoints

### Campaign APIs
- `GET /api/campaigns` - List all campaigns
- `POST /api/campaigns/run` - Execute campaign (send SMS, tag leads)

### Lead APIs
- `GET /api/leads` - Get filtered leads (q, tags, campaign)
- `GET /api/leads/list` - Get leads with tag aggregation
- `POST /api/leads/import` - Bulk import leads
- `POST /api/leads/upsert` - Create/update single lead
- `POST /api/leads/upload-document` - Parse document with AI

### Other APIs
- `GET /api/tags` - List all tags with counts
- `POST /api/ingest` - Process uploaded file
- `POST /api/ai-response` - Generate AI response (1 point)
- `POST /api/sms/send` - Send SMS via Twilio

---

## Key Functions

### LocalStorage Operations
```typescript
// Load/save store
loadStore(): StoreShape | null
saveStore(data: StoreShape): void

// Thread management
upsertThread(lead_id, channel, campaign_id?): Thread
sendOutbound(lead_id, channel, body, campaign_id?, status?): number
simulateInbound(thread_id, body): void
updateMessageStatus(messageId, status, twilioMessageId?): void

// Display
getMessageStatusIcon(status): { icon: string; color: string }
```

### Campaign Management
```typescript
// LocalStorage campaigns
loadCampaigns(): Campaign[]
saveCampaigns(list): void
upsertCampaign(campaign): void
removeCampaign(id): void
newCampaign(): Campaign
```

---

## Search & Filter Patterns

### Lead Search
- Full-text search across: first_name, last_name, email, phone, state, tags
- Query parameter: `q=John`

### Tag Filtering
- Multi-select tags with AND logic (all tags must match)
- Query parameter: `tags=tag1,tag2`

### Campaign Filtering
- Campaign by ID
- Query parameter: `campaign=cmp_123`

---

## Common Workflows

### Import Leads
1. User uploads CSV from `/app/leads/page.tsx`
2. Maps CSV columns to canonical fields
3. Calls `POST /api/leads/import`
4. Creates campaign if specified
5. Returns summary with added/duplicate counts

### Execute Campaign
1. User selects leads from `/app/leads/page.tsx`
2. Enters message template with personalization tags
3. Calls `POST /api/campaigns/run`
4. SMS sent via Twilio
5. Updates campaign stats
6. Tags all leads

### Send/Reply Message
1. User opens conversation in `/app/texts/page.tsx`
2. Types message or enables AI mode
3. If AI: calls `POST /api/ai-response` (costs 1 point)
4. Message saved to LocalStorage
5. Thread updated with last message + timestamp

---

## Important Notes

- **Phone Format:** All phone numbers should be E.164 format: `+1234567890`
- **State Code:** Two-letter uppercase codes: `FL`, `TX`, `CA`, etc.
- **Message Personalization:** Use `{{first}}`, `{{last}}`, `{{email}}`, `{{phone}}`, `{{state}}`
- **Points System:** 1 point per SMS sent, 1 point per AI response, 3 points per document parsing
- **Storage:** Primary storage is JSON files in `/data/` directory
- **LocalStorage:** Only for Texts page (leads, threads, messages)
- **Spam Detection:** Keywords like "free money", "click here", "act now" block campaign execution

---

## Missing/Unfinished Features

Based on Prisma schema (not yet implemented):
- Real database integration (PostgreSQL)
- Transaction/billing history tracking
- Import undo functionality
- Scheduled campaigns with delays
- Email sending (schema exists, not fully implemented)
- Message read receipts via Twilio webhooks
- Conversation flow steps with dispositions
- AI note generation per lead

