# LocalStorage to Supabase Migration Plan

## Status: IN PROGRESS

### Completed:
- ✅ Database schema created and run in Supabase
- ✅ `/api/campaigns` endpoint created
- ✅ `/api/settings` endpoint created
- ✅ `/api/flows` endpoint created (from earlier work)

### Remaining Work:

#### 1. API Endpoints to Create:
- [ ] `/api/leads` - CRUD for leads
- [ ] `/api/threads` - CRUD for threads (including flow_step updates)
- [ ] `/api/messages` - CRUD for messages
- [ ] `/api/transactions` - Points transactions
- [ ] `/api/points/spend` - Spend points and create transaction
- [ ] `/api/sending-history` - Rate limiting history

#### 2. Store Files to Update:

**`lib/campaignsStore.ts`**
- Replace `loadCampaigns()` to fetch from `/api/campaigns`
- Replace `saveCampaigns()` to POST/PUT to `/api/campaigns`
- Replace `upsertCampaign()` to use API
- Replace `removeCampaign()` to DELETE from API

**`lib/settingsStore.ts`**
- Replace `loadSettings()` to fetch from `/api/settings`
- Replace `saveSettings()` to POST to `/api/settings`
- All helper functions (updateTwilioConfig, etc.) should call saveSettings

**`lib/localStore.ts`**
- Replace `loadStore()` to fetch leads/threads/messages from API
- Replace `saveStore()` to batch update via API
- May need to create helper functions for individual updates

**`lib/pointsStore.ts`**
- Replace with Supabase-based functions
- `loadPoints()` → fetch from `users` table (credits column)
- `spendPoints()` → call `/api/points/spend` which updates credits AND creates transaction
- `addPoints()` → similar API call
- Keep transaction history in `transactions` table

**`lib/spamDetection.ts`**
- Replace localStorage sending history with Supabase `sending_history` table
- Update `recordSend()` and `getVelocity()` to query database

#### 3. Pages/Components to Update:

**`app/(dashboard)/texts/page.tsx`**
- Remove `localStorage.getItem/setItem` for thread flow steps
- Update thread flow steps via `/api/threads` (update flow_step column)
- Already loads flows from API ✅

**`app/(dashboard)/points/page.tsx`**
- Remove localStorage access for plan type
- Fetch plan_type from `users` table via API or context

**`app/layout.tsx`**
- Remove localStorage access for favicon/plan detection
- Use server-side user data or client context

**`components/Sidebar.tsx`**
- Remove localStorage access for logo selection
- Use server-side user data or client context
- Remove `loadStore` import, use API for leads count

**`app/api/leads/upsert/route.ts`**
- Already imports `loadSettings` - this will work once settingsStore is updated

**`app/api/email/send/route.ts`**
- Imports `loadSettings` and `spendPointsForAction` - will work once updated

#### 4. New Utility Files Needed:

**`lib/supabase/points.ts`** (Server-side points management)
```typescript
// Server-side functions to:
// - getPointsBalance(userId)
// - spendPoints(userId, amount, description)
// - addPoints(userId, amount, description, type)
// - createTransaction(userId, data)
```

**`lib/supabase/store.ts`** (Server-side data access)
```typescript
// Server-side functions to:
// - getLeads(userId)
// - getThreads(userId)
// - getMessages(userId, threadId)
// - updateThread(userId, threadId, data)
```

#### 5. Migration Strategy:

**Phase 1: Create all API endpoints** (safer to have them ready)
- leads, threads, messages, transactions, points

**Phase 2: Update store files one by one**
- Start with campaignsStore (least dependencies)
- Then settingsStore
- Then pointsStore
- Then localStore
- Finally spamDetection

**Phase 3: Update pages/components**
- Remove all direct localStorage calls
- Use updated store functions or direct API calls

**Phase 4: Testing**
- Test each major feature (campaigns, settings, messaging, points)
- Verify no localStorage calls remain
- Check browser console for errors

**Phase 5: Cleanup**
- Remove any commented-out localStorage code
- Update documentation
- Commit and push

## Quick Reference: LocalStorage → Supabase Mapping

| LocalStorage Key | Supabase Table | Notes |
|-----------------|----------------|-------|
| `trippdrip.campaigns.v1` | `campaigns` | Full CRUD via API |
| `trippdrip.settings.v1` | `user_settings` | One row per user |
| `trippdrip.store.v1` | `leads`, `threads`, `messages` | Separate tables |
| `userPoints` | `users.credits` + `transactions` | Balance in users, history in transactions |
| `sendingHistory` | `sending_history` | For rate limiting |
| `thread_{id}_flowStep` | `threads.flow_step` | JSONB column |

## Notes:
- All tables have RLS policies already configured
- All tables have proper indexes
- `updated_at` triggers are set up
- Foreign key relationships are established
