# TrippDrip v8 Codebase Exploration Summary

## Overview
TrippDrip is a Next.js application for managing SMS/Email campaigns and leads with points-based billing. The application uses a hybrid data storage approach with JSON files and LocalStorage, along with Prisma schema definitions for potential database integration.

---

## 1. Campaign Management

### 1.1 Campaign Pages/Components
**Location:** `/app/campaigns/page.tsx`
- **Purpose:** View and manage all campaigns
- **Key Features:**
  - Lists all campaigns with search/filter
  - Displays campaign stats (total leads, messages sent, active tags)
  - Shows campaign creation date and last updated
  - Links to template creation page
  
**Data Display:**
```typescript
type Campaign = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tags_applied: string[];
  lead_ids: string[];
  lead_count: number;
  messages_sent?: number;
};
```

### 1.2 Campaign API Routes

**GET `/api/campaigns`** - Retrieve all campaigns
- **File:** `/app/api/campaigns/route.ts`
- **Storage:** Reads from `data/campaigns.json`
- **Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": "cmp_12345",
      "name": "Campaign Name",
      "tags_applied": ["tag1", "tag2"],
      "lead_ids": ["lead1", "lead2"],
      "lead_count": 2,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z",
      "messages_sent": 0
    }
  ]
}
```

**POST `/api/campaigns/run`** - Execute a campaign
- **File:** `/app/api/campaigns/run/route.ts`
- **Purpose:** Send SMS messages and tag leads in a campaign
- **Key Features:**
  - Personalize messages with lead data (`{{first}}`, `{{last}}`, `{{email}}`, etc.)
  - Send via Twilio API
  - Spam detection
  - Points validation (1 point per SMS)
  - Creates/updates campaign records
  - Returns detailed send results per lead

**Request Body:**
```json
{
  "leadIds": ["lead1", "lead2"],
  "campaignName": "My Campaign",
  "message": "Hey {{first}}, your message here",
  "addTags": ["tag1"],
  "sendSMS": true,
  "fromNumber": "+1234567890",
  "userPoints": 50,
  "twilioConfig": { "accountSid": "...", "authToken": "...", "phoneNumbers": [...] },
  "checkSpam": true
}
```

**Response:**
```json
{
  "ok": true,
  "campaignId": "cmp_12345",
  "updated": 2,
  "smsSent": true,
  "sendResults": {
    "total": 2,
    "success": 2,
    "failed": 0,
    "details": [
      {
        "leadId": "lead1",
        "phone": "+1234567890",
        "success": true,
        "messageId": "SM123456"
      }
    ]
  },
  "pointsUsed": 2
}
```

### 1.3 Campaign Data Structure (Prisma Schema)
**File:** `/prisma/schema.prisma`

```prisma
model Campaign {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  
  name        String
  description String?
  
  // Campaign settings
  channel     String   // 'sms' | 'email' | 'both'
  message     String
  
  // Filters
  tags        String[]
  leadIds     String[] @map("lead_ids") @default([])
  
  // Stats
  totalLeads  Int      @default(0) @map("total_leads")
  messagesSent Int     @default(0) @map("messages_sent")
  messagesDelivered Int @default(0) @map("messages_delivered")
  messagesFailed Int @default(0) @map("messages_failed")
  
  // Status
  status      String   @default("draft") // 'draft' | 'running' | 'completed' | 'failed'
  
  // Scheduling
  scheduledAt DateTime? @map("scheduled_at")
  startedAt   DateTime? @map("started_at")
  completedAt DateTime? @map("completed_at")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  // Relations
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([status])
  @@map("campaigns")
}
```

### 1.4 Campaign LocalStorage Store
**File:** `/lib/campaignsStore.ts`

```typescript
type Campaign = {
  id: number;
  name: string;
  status: 'Draft' | 'Running' | 'Paused' | 'Completed';
  created_at: string;
  filters?: { states?: string[]; tags?: string[]; repliedOnly?: boolean };
  fromNumbers?: string[];
  sendWindow?: { start: string; end: string; tz: string };
  steps: Step[];
  stats?: { sent: number; replied: number; failed: number };
};

type Step = {
  id: number;
  type: 'sms' | 'email';
  body: string;
  delayHours: number;
};
```

---

## 2. Lead Management

### 2.1 Lead Pages/Components
**Location:** `/app/leads/page.tsx`
- **Purpose:** Import, manage, and filter leads
- **Key Features:**
  - CSV/Excel import with column mapping
  - AI-powered document parsing
  - Search by name, email, phone, state, tags
  - Filter by campaign and tags
  - Bulk tag operations
  - Campaign creation from imports
  - Live import summaries with data quality metrics

**Lead Data Type:**
```typescript
type Lead = {
  id?: string | number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  status?: string;
  [k: string]: any;
};
```

### 2.2 Lead Components
**File:** `/components/leads/MainTable.tsx`
- Displays leads in a searchable, filterable table
- Shows: Name, Email, Phone, State, Tags, Status
- Tag filtering with active selection indicators

### 2.3 Lead API Routes

**GET `/api/leads`** - Retrieve filtered leads
- **File:** `/app/api/leads/route.ts`
- **Query Parameters:**
  - `q` - Search query
  - `tags` - Comma-separated tag filters
  - `campaign` - Filter by campaign
- **Storage:** Reads from `data/leads.json`
- **Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": "lead123",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "+11234567890",
      "email": "john@example.com",
      "state": "FL",
      "tags": ["tag1", "tag2"],
      "status": "active"
    }
  ]
}
```

**GET `/api/leads/list`** - Advanced lead listing
- **File:** `/app/api/leads/list/route.ts`
- **Query Parameters:**
  - `search` - Full-text search
  - `tags` - Comma-separated tag filters
- **Returns:** Items + total count + all available tags
```json
{
  "items": [...],
  "total": 100,
  "tagsAll": ["tag1", "tag2", "tag3"]
}
```

**POST `/api/leads/import`** - Import leads from CSV/file
- **File:** `/app/api/leads/import/route.ts`
- **Purpose:** Bulk import leads and optionally create campaign
- **Features:**
  - Deduplication by ID, phone, or email
  - Merge tags with existing leads
  - Create campaign with leads
  - Backup existing leads before import
- **Request Body:**
```json
{
  "items": [{ "first_name": "...", ... }],
  "addTags": ["tag1"],
  "campaignName": "My Campaign"
}
```
- **Response:**
```json
{
  "ok": true,
  "message": "leads successfully uploaded",
  "campaignId": "cmp_123",
  "added": 10,
  "total": 45
}
```

**POST `/api/leads/upsert`** - Create or update a single lead
- **File:** `/app/api/leads/upsert/route.ts`
- **Features:**
  - Merge tags with existing lead
  - Send welcome email if configured
  - Deduplication by name, phone, email
- **Request Body:** A single Lead object
- **Response:**
```json
{
  "ok": true,
  "action": "inserted" | "updated",
  "total": 45
}
```

**POST `/api/leads/upload-document`** - AI-powered document parsing
- **File:** `/app/api/leads/upload-document/route.ts`
- **Cost:** 3 points per document
- **Extracts:** Lead information from PDFs/documents

### 2.4 Lead Data Structure (Prisma Schema)
**File:** `/prisma/schema.prisma`

```prisma
model Lead {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  
  firstName   String?  @map("first_name")
  lastName    String?  @map("last_name")
  phone       String?
  email       String?
  state       String?
  tags        String[]
  status      String   @default("active")
  
  // AI-generated fields
  aiTags      String[] @map("ai_tags") @default([])
  aiNotes     String?  @map("ai_notes")
  
  // Campaign tracking
  campaignIds String[] @map("campaign_ids") @default([])
  
  // Metadata
  source      String?
  customFields Json?  @map("custom_fields")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  // Relations
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages    Message[]
  
  @@index([userId])
  @@index([phone])
  @@index([email])
  @@index([tags])
  @@map("leads")
}
```

---

## 3. Messaging & Texts Area

### 3.1 Texts Page
**Location:** `/app/texts/page.tsx`
- **Purpose:** Manage SMS conversations with leads
- **Key Features:**
  - Display list of replied conversations
  - Conversation detail view with message history
  - Message composer (manual + AI-powered)
  - AI reply toggle with automatic response generation
  - Filter by: unread status, campaign, search query
  - Message timestamps and sender indicators
  - Flow step tags for conversation state tracking

**Message Type:**
```typescript
type Msg = {
  id: number;
  thread_id: number;
  direction: 'in' | 'out';
  sender: 'lead' | 'agent';
  body: string;
  created_at: string;
  status?: MessageStatus; // 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
};

type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";
```

### 3.2 Messaging Components

**ConversationDrawer Component**
- **File:** `/components/ConversationDrawer.tsx`
- Displays conversation in a slide-over drawer
- Shows message history with status icons
- Text input for composing replies
- Message status indicators (✓, ✓✓, ✗)

**Composer Component** (in texts/page.tsx)
- Manual text input or AI-powered reply mode
- Toggle between regular send and AI generation
- Points balance checking for AI features
- Cost: 1 point per AI response

### 3.3 Message Data Structure (Prisma Schema)

```prisma
model Message {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  leadId      String   @map("lead_id")
  
  // Message details
  channel     String   // 'sms' | 'email'
  direction   String   // 'in' | 'out'
  sender      String   // 'agent' | 'lead' | 'ai'
  
  // Content
  subject     String?  // For emails
  body        String
  
  // Status
  status      String   @default("pending") // 'pending' | 'sent' | 'delivered' | 'failed' | 'read'
  error       String?
  
  // External IDs
  twilioSid   String?  @map("twilio_sid")
  emailId     String?  @map("email_id")
  
  // Campaign tracking
  campaignId  String?  @map("campaign_id")
  
  // AI features
  aiGenerated Boolean  @default(false) @map("ai_generated")
  
  // Costs
  pointsCost  Float    @default(0) @map("points_cost")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  // Relations
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([leadId])
  @@index([channel])
  @@index([direction])
  @@index([status])
  @@index([createdAt])
  @@map("messages")
}
```

### 3.4 LocalStorage Message Store
**File:** `/lib/localStore.ts` & `/lib/storeOps.ts`

LocalStorage key: `trippdrip.store.v1`

**Store Shape:**
```typescript
type StoreShape = {
  leads: any[];
  threads: any[];
  messages: any[];
};

type Thread = {
  id: number;
  lead_id: number;
  channel: 'sms' | 'email';
  last_message_snippet: string;
  last_sender: 'agent' | 'lead';
  unread: boolean;
  campaign_id?: number;
  updated_at: string;
};

type Message = {
  id: number;
  thread_id: number;
  direction: 'in' | 'out';
  sender: 'agent' | 'lead' | 'ai';
  body: string;
  created_at: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  messageId?: string; // Twilio message ID
};
```

**Key StoreOps Functions:**
- `upsertThread()` - Create or get conversation thread
- `sendOutbound()` - Send outbound message
- `simulateInbound()` - Add inbound lead response
- `updateMessageStatus()` - Update delivery status
- `getMessageStatusIcon()` - Get status display info

### 3.5 Message Status & Disposition Fields

From the database schema and code, there are TWO status systems:

1. **Message Status** (in Message model):
   - `pending` - Message queued for sending
   - `sent` - Message sent to Twilio
   - `delivered` - Confirmed delivery to lead
   - `read` - Lead has read (SMS read receipts)
   - `failed` - Send failed

2. **Lead Status** (in Lead model):
   - Default: `"active"`
   - Customizable per lead (imported from CSV)

3. **Campaign Status** (in Campaign model):
   - `draft` - Initial state, not running
   - `running` - Currently executing
   - `completed` - Finished successfully
   - `failed` - Execution failed

---

## 4. Data Storage Architecture

### 4.1 JSON File Storage
Located in `/data/` directory:
- **`leads.json`** - All lead records
- **`campaigns.json`** - All campaign records
- **`tags.json`** - Tag frequency counts
- **`leads_backup_*.json`** - Automatic backups before import
- **`emails.json`** - Email send history

### 4.2 LocalStorage (Client-side)
- **Key:** `trippdrip.store.v1`
- **Contents:** Leads, threads, messages (for Texts page)
- **Event:** `trippdrip:store-updated` - Fired when store changes

### 4.3 Prisma (Not Yet Active)
- Schema defined in `/prisma/schema.prisma`
- PostgreSQL configured
- Models for User, Lead, Campaign, Message, Transaction, ImportHistory
- Ready for database migration when needed

---

## 5. Key API Response Patterns

### Standard Success Response:
```json
{
  "ok": true,
  "items": [...],
  "total": 100
}
```

### Standard Error Response:
```json
{
  "ok": false,
  "error": "Error message"
}
```

### Campaign Execution Response:
```json
{
  "ok": true,
  "campaignId": "cmp_123",
  "updated": 45,
  "smsSent": true,
  "sendResults": {
    "total": 45,
    "success": 42,
    "failed": 3,
    "details": [...]
  },
  "pointsUsed": 42
}
```

---

## 6. Status & Disposition Field Summary

### Where Status Fields Appear:

1. **Message Status** (5 states)
   - Database: `messages.status`
   - LocalStorage: `messages[].status`
   - Used for: Delivery tracking, read receipts
   - Values: pending, sent, delivered, read, failed

2. **Lead Status** (Custom, typically "active")
   - Database: `leads.status`
   - JSON File: `leads[].status`
   - Used for: Lead lifecycle tracking
   - Values: Custom (imported from data)

3. **Campaign Status** (4 states)
   - Database: `campaigns.status`
   - JSON File: `campaigns[].status`
   - Used for: Campaign lifecycle
   - Values: draft, running, completed, failed

4. **Thread Unread Flag**
   - LocalStorage: `threads[].unread`
   - Used for: Conversation priority
   - Values: boolean

### Status Display:
- Message status shown with icons: ⏱ (pending), ✓ (sent), ✓✓ (delivered), ✓✓ (read), ✗ (failed)
- Color coding: gray, blue, blue, dark blue, red
- Shown next to outbound messages in conversation view

---

## 7. File Structure Map

### App Routes:
```
/app
├── /campaigns
│   └── page.tsx (Campaign listing)
├── /leads
│   └── page.tsx (Lead management, import)
├── /texts
│   └── page.tsx (SMS conversations)
├── /api
│   ├── /campaigns
│   │   ├── route.ts (GET campaigns)
│   │   └── /run
│   │       └── route.ts (POST execute campaign)
│   ├── /leads
│   │   ├── route.ts (GET leads)
│   │   ├── /list
│   │   │   └── route.ts (GET filtered leads)
│   │   ├── /import
│   │   │   └── route.ts (POST bulk import)
│   │   ├── /upsert
│   │   │   └── route.ts (POST single lead)
│   │   └── /upload-document
│   │       └── route.ts (POST AI parsing)
│   └── [other APIs...]
```

### Components:
```
/components
├── ConversationDrawer.tsx (Message drawer)
├── leads/
│   └── MainTable.tsx (Leads table)
└── [other components...]
```

### Libraries:
```
/lib
├── campaignsStore.ts (Campaign state)
├── localStore.ts (LocalStorage management)
├── storeOps.ts (Message/thread operations)
├── settingsStore.ts (User settings)
├── pointsStore.ts (Points/billing)
├── twilioClient.ts (Twilio integration)
└── [other utilities...]
```

---

## 8. Key Integration Points

### Campaign to Lead:
- Campaign stores `lead_ids[]` array
- Campaign stores `tags_applied[]` array
- Campaigns filter leads via tags or explicit ID list

### Lead to Message:
- Message has `lead_id` foreign key
- Lead has `campaignIds[]` array for tracking
- Threads link leads to messages via `lead_id`

### Message Flow:
1. Campaign execution triggers `/api/campaigns/run`
2. Route reads leads from `data/leads.json`
3. Sends SMS via Twilio API
4. Updates campaign stats (messages_sent, etc.)
5. Tags leads with campaign tags
6. Returns send results with status per lead

### Texts View Flow:
1. Loads from LocalStorage `trippdrip.store.v1`
2. Shows threads where lead has replied (`direction: 'in'`)
3. Filters by campaign, search, unread status
4. Composer sends messages and updates thread
5. AI mode generates responses (1 point cost)

---

## 9. Current Limitations & Opportunities

### Limitations:
- JSON file storage not suitable for production scale
- LocalStorage limited to ~5-10MB browser limit
- No real-time synchronization between sessions
- Message history only in LocalStorage, not persisted to server

### Opportunities for Enhancement:
1. Migrate to Prisma + PostgreSQL (schema already exists)
2. Add disposition codes (e.g., "Interested", "Not Interested", "Follow-up Later")
3. Implement real-time message updates via WebSockets
4. Add message threading details (response time, engagement metrics)
5. Add lead score/disposition history tracking
6. Implement batch operation status tracking
7. Add campaign performance analytics
