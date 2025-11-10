# Implementation Plan - Lead Management & Advanced Features

## Safety Checkpoint
**Tag**: `v1.0-working`
**Status**: All conversation flow features working perfectly
- Calendar times display after questions
- "126 options" message
- Optimized performance
- Collected info in calendar

## Rollback Instructions
If anything breaks:
```bash
git checkout v1.0-working
git push origin main --force
```

---

## Phase 1: Lead Management System
**Goal**: Capture and store all lead data from conversations

### 1.1 Database Migration
- [x] Created migration file: `supabase/migrations/20250110_enhance_leads_for_conversations.sql`
- [ ] Run migration in Supabase dashboard
- [ ] Verify tables created

### 1.2 Lead Creation API
**File**: `app/api/leads/route.ts`
- Create lead when conversation starts
- Update lead as conversation progresses
- Link lead to conversation session
- Track all collected info

### 1.3 Integration with Existing Flow
**File**: `app/api/test-flow-response/route.ts`
- Add lead creation/update on each message
- Store conversation state for recovery
- Track session progress
- **IMPORTANT**: Non-breaking changes only!

---

## Phase 2: Conversation Recovery
**Goal**: Allow users to resume abandoned conversations

### 2.1 Session Persistence
- Save conversation state after each message
- Track abandonment (15min+ no activity)
- Generate recovery links

### 2.2 Resume Endpoint
**File**: `app/api/conversations/resume/route.ts`
- Load saved conversation state
- Restore collected info
- Continue from last step

---

## Phase 3: SMS Notifications
**Goal**: Send appointment confirmations and reminders

### 3.1 Twilio Setup
- [ ] Get Twilio credentials
- [ ] Add to environment variables:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`

### 3.2 SMS Service
**File**: `lib/sms/twilio.ts`
- Send confirmation SMS when appointment booked
- Send 24hr reminder
- Send 1hr reminder

### 3.3 SMS Templates
**File**: `lib/sms/templates.ts`
- Confirmation message
- Reminder messages
- Personalized with lead data

---

## Phase 4: AI Response Quality
**Goal**: Improve consistency and add guardrails

### 4.1 Response Templates
**File**: `lib/ai/templates.ts`
- Common scenario templates
- Fallback responses
- Error handling

### 4.2 Quality Checks
**File**: `lib/ai/quality.ts`
- Validate AI responses
- Detect confusion/frustration
- Trigger human handoff

---

## Testing Strategy

### After Each Phase:
1. Test existing flow (should still work)
2. Test new features
3. Check database records
4. Verify no regressions

### Critical Test Cases:
- [ ] Full conversation flow (existing)
- [ ] Calendar booking (existing)
- [ ] Lead creation
- [ ] Conversation recovery
- [ ] SMS sending
- [ ] AI quality

---

## Deployment Plan

### Development:
1. Build each phase locally
2. Test thoroughly
3. Commit to git

### Staging:
1. Run migration in Supabase
2. Deploy to Vercel
3. Test on staging domain

### Production:
1. Final testing
2. Deploy
3. Monitor logs

---

## Current Status
- ✅ Phase 1.1 - Database schema created
- 🔄 Phase 1.2 - Building lead APIs
- ⏳ Phase 1.3 - Integration pending
- ⏳ Phase 2 - Not started
- ⏳ Phase 3 - Not started
- ⏳ Phase 4 - Not started
