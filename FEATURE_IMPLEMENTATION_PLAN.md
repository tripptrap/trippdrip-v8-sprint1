# TrippDrip v8 - Feature Implementation Plan

## ✅ Completed Features
- Lead disposition system (sold, not_interested, callback, qualified, nurture)
- Delete campaigns and leads
- Credit cost calculation system
- Password protection
- Green styling for sold leads
- Real-time credit display

## 🚀 Planned Features - Implementation Guide

### 1. Analytics Dashboard (`/app/analytics/page.tsx`)

**Database**: Use existing models, add aggregation queries

**Metrics to Display**:
- Total leads, campaigns, messages sent
- Response rate (% of sent messages that got replies)
- Conversion rate (% of leads marked as "sold")
- Average response time
- Best performing times (hour of day analysis)
- Revenue tracking (if you add revenue field to Lead)
- Cost per acquisition (credits spent / leads sold)

**Implementation**:
```typescript
// /app/api/analytics/route.ts
- GET /api/analytics/overview
  - Return: total leads, total campaigns, total messages, response rate, conversion rate
- GET /api/analytics/performance
  - Return: messages by hour, messages by day, response time analysis
- GET /api/analytics/campaigns
  - Return: top performing campaigns by response rate and conversion
```

**UI Components**:
- Stat cards (total leads, total messages, response rate, conversion rate)
- Line chart: Messages sent over time
- Bar chart: Response rates by campaign
- Heatmap: Best times to send (hour of day × day of week)
- Pie chart: Lead disposition breakdown

**Libraries Needed**:
```bash
npm install recharts date-fns
```

---

### 2. Lead Scoring System

**Schema**: ✅ Already added to Prisma
- `score` (0-100)
- `temperature` (hot/warm/cold)
- `lastEngaged`
- `responseRate`

**Scoring Logic** (`/lib/leadScoring.ts`):
```typescript
function calculateLeadScore(lead, messages):
  baseScore = 0

  // Recent engagement (30 points)
  if lastEngaged < 24 hours: +30
  else if lastEngaged < 7 days: +20
  else if lastEngaged < 30 days: +10

  // Response rate (30 points)
  responseRate * 30

  // Message frequency (20 points)
  if totalReceived > 5: +20
  else if totalReceived > 2: +10

  // Disposition (20 points)
  if disposition === 'qualified': +20
  if disposition === 'callback': +15
  if disposition === 'sold': +0 (already converted)
  if disposition === 'not_interested': -50

  // Temperature classification:
  if score >= 70: 'hot' 🔥
  if score >= 40: 'warm' 🌡️
  if score < 40: 'cold' ❄️
```

**Implementation**:
1. Create `/lib/leadScoring.ts` with calculateLeadScore function
2. Add API route `/api/leads/recalculate-scores` (runs nightly cron or on-demand)
3. Update leads table to show score and temperature indicators
4. Add filter: "Show only hot leads"
5. Auto-sort inbox by score (highest first)

---

### 3. Message Scheduling

**Schema**: ✅ Already added
- `scheduledFor` field on Message
- `sentAt` field on Message
- Status includes 'scheduled'

**Implementation**:
```typescript
// /app/api/messages/schedule/route.ts
POST /api/messages/schedule
{
  leadId: string,
  body: string,
  scheduledFor: DateTime,
  channel: 'sms' | 'email'
}

// /app/api/messages/send-scheduled/route.ts
// Cron job that runs every 5 minutes
- Find all messages where scheduledFor <= now AND status = 'scheduled'
- Send each message via Twilio/Email
- Update status to 'sent' and set sentAt
```

**UI Changes**:
1. In Texts page Composer: Add "Schedule Send" toggle
2. When enabled, show datetime picker
3. Show scheduled messages in a separate tab
4. Add "Cancel Scheduled" button for each

**Cron Setup** (Vercel):
```json
// vercel.json
{
  "crons": [{
    "path": "/api/messages/send-scheduled",
    "schedule": "*/5 * * * *"
  }]
}
```

---

### 4. Bulk Actions

**Implementation** (add to `/app/leads/page.tsx`):

**UI Changes**:
1. ✅ Already have checkbox selection
2. Add dropdown menu: "Bulk Actions"
   - Update Status (dropdown: active/archived/sold)
   - Update Disposition (dropdown: sold/not_interested/etc)
   - Add Tags (multi-select)
   - Remove Tags (multi-select)
   - Export to CSV
   - Delete Selected (✅ already exists)

**API Routes**:
```typescript
// /app/api/leads/bulk-update/route.ts
POST /api/leads/bulk-update
{
  leadIds: string[],
  updates: {
    status?: string,
    disposition?: string,
    addTags?: string[],
    removeTags?: string[],
    temperature?: string
  }
}

// /app/api/leads/export/route.ts
POST /api/leads/export
{
  leadIds: string[],
  format: 'csv' | 'json'
}
// Returns downloadable file
```

**CSV Export Logic**:
```typescript
import { Parser } from 'json2csv';

function exportLeadsToCSV(leads) {
  const fields = ['firstName', 'lastName', 'phone', 'email', 'state', 'tags', 'status', 'disposition', 'score', 'temperature'];
  const parser = new Parser({ fields });
  const csv = parser.parse(leads);
  return csv;
}
```

---

### 5. Smart Follow-up System

**Schema**: ✅ Already added FollowUp model

**Types of Follow-ups**:
1. **Manual Callback**: User sets date/time to follow up
2. **Auto-reminder**: System reminds after X days of no response
3. **Snooze Lead**: Hide lead for X days, then resurface
4. **Auto-sequence**: Multi-step follow-up campaign

**Implementation**:

**UI in Leads Page**:
- Add "Follow-up" button per lead
- Modal with options:
  - Set callback date/time
  - Add note
  - Pre-write message to send

**UI in Texts Page**:
- Show 🔔 icon if follow-up is due
- "Snooze for..." button (1 day, 3 days, 1 week)

**API Routes**:
```typescript
// /app/api/follow-ups/route.ts
POST /api/follow-ups
{
  leadId: string,
  type: 'callback' | 'reminder' | 'auto_sequence',
  dueDate: DateTime,
  note?: string,
  messageBody?: string
}

GET /api/follow-ups?status=pending
// Returns all pending follow-ups for today

// /app/api/follow-ups/complete/route.ts
POST /api/follow-ups/complete
{
  followUpId: string
}
```

**Dashboard Widget** (`/app/dashboard/page.tsx`):
```typescript
"Today's Follow-ups" section
- Shows all follow-ups due today
- Click to open lead conversation
- Mark as complete button
```

**Cron Job** (send reminders):
```typescript
// /app/api/follow-ups/send-reminders/route.ts
// Runs daily at 9 AM
- Find all follow-ups where dueDate = today AND type = 'auto_reminder'
- Send the pre-written message
- Mark follow-up as completed
```

---

## 📊 Analytics Dashboard - Detailed Spec

### Page: `/app/analytics/page.tsx`

**Layout**:
```
┌─────────────────────────────────────────┐
│  Analytics Dashboard                     │
├─────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │Total │ │Total │ │Response│ │Conv│   │
│  │Leads │ │Msgs  │ │Rate    │ │Rate│   │
│  └──────┘ └──────┘ └──────┘ └──────┘   │
├─────────────────────────────────────────┤
│  Messages Sent Over Time (Line Chart)   │
│  [Chart showing daily message volume]   │
├─────────────────────────────────────────┤
│  Campaign Performance (Bar Chart)        │
│  [Campaigns ranked by response rate]    │
├─────────────────────────────────────────┤
│  Best Times to Send (Heatmap)           │
│  [Hour of day × Day of week heatmap]    │
├─────────────────────────────────────────┤
│  Lead Disposition Breakdown (Pie Chart) │
│  [sold/not_interested/qualified/etc]    │
└─────────────────────────────────────────┘
```

**API Endpoints Needed**:
```typescript
GET /api/analytics/overview
Response: {
  totalLeads: number,
  totalMessages: number,
  responseRate: number, // %
  conversionRate: number, // % of leads marked "sold"
  avgResponseTime: number, // hours
  totalCreditsUsed: number
}

GET /api/analytics/messages-over-time?days=30
Response: {
  data: [{ date: '2025-01-15', sent: 120, received: 45 }, ...]
}

GET /api/analytics/campaign-performance
Response: {
  campaigns: [{
    name: string,
    messagesSent: number,
    responses: number,
    responseRate: number,
    conversions: number,
    conversionRate: number
  }]
}

GET /api/analytics/best-times
Response: {
  heatmap: {
    '0': { 'Mon': 5, 'Tue': 3, ... }, // Hour 0 (midnight)
    '1': { 'Mon': 2, 'Tue': 1, ... },
    ...
  }
}
```

---

## 🎯 Implementation Priority

**Phase 1** (High Impact, Easy):
1. ✅ Bulk Actions UI (1-2 hours)
2. ✅ Lead Scoring calculations (2-3 hours)
3. ✅ Follow-up system basics (3-4 hours)

**Phase 2** (High Value):
4. Message Scheduling (4-5 hours)
5. Analytics Dashboard (6-8 hours)

**Phase 3** (Nice to Have):
6. Advanced analytics (A/B testing, cohort analysis)
7. Team collaboration features
8. Webhook integrations

---

## 🛠️ Quick Start Commands

```bash
# Install required packages
npm install recharts date-fns json2csv

# Update database schema
npx prisma generate
npx prisma db push

# Run dev server
npm run dev
```

---

## 📝 Notes

- All scoring/analytics can start with JSON file storage, migrate to DB later
- Cron jobs require Vercel Pro plan ($20/month) or use external cron service
- For webhooks, use Vercel serverless functions (already set up)
- Consider adding "revenue" field to Lead model for ROI calculations

---

## 🔄 Next Steps

1. Review this plan
2. Decide which features to build first
3. Create feature branches for each
4. Implement one feature at a time
5. Test thoroughly before moving to next
6. Deploy incrementally to avoid breaking changes

