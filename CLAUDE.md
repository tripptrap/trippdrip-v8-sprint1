# HyveWyre - Project Context

## MANDATORY: Read docs/SYSTEM_STATE.md before non-trivial work
That file tracks how the system *actually* behaves right now — what's confirmed
working, what's confirmed broken, and gotchas that cost real time to rediscover
(a Stripe API shape that doesn't match training data, a DB column code assumed
existed but didn't, etc.). This CLAUDE.md file covers what the product is *supposed*
to be; SYSTEM_STATE.md covers what it *actually* currently is. They drift apart
without active upkeep — that drift is exactly what caused the 10DLC campaign to fail
the same way more than once.

**Update SYSTEM_STATE.md yourself, without being asked, whenever you:** fix a bug
whose root cause reveals how something really works, find a gap between what code
assumes and what's actually true, or ship a change that alters a subsystem's
behavior end to end. This is a maintenance duty, not a one-time task — treat it the
same as running tests or type-checking before calling work done.

## MANDATORY: Verify the database against the live database
**Before writing any code that touches the DB** (queries, inserts, upserts, migrations,
API routes), confirm the schema against the running database — not from memory, not from
an exported snapshot, and not by trusting that surrounding code got it right. Snapshots
go stale, which makes them the same drift problem they were meant to solve.

```bash
supabase db query --linked "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='<table>' ORDER BY ordinal_position;"
supabase db query --linked "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='<table>';"
```

Specific traps, each of which has already shipped a real bug here:
- **A column the code reads may not exist at all.** `user_telnyx_numbers.capabilities`
  was read unconditionally by a page and written by 5 routes while absent from the DB.
- **`onConflict` must name a real unique constraint.** supabase-js doesn't validate it;
  Postgres returns `42P10` at runtime. Check `pg_indexes` before writing one.
- **NOT NULL columns with no default must be supplied.** `dnc_list.normalized_phone`
  was omitted, so every write failed.
- **supabase-js returns `{ error }`, it does not throw.** An unchecked call fails
  completely silently — a `try/catch` around it catches nothing. Always check `error`
  on writes. This is how STOP opt-outs failed for months while logging success.
- **Prefer an existing RPC over hand-rolled table writes** when one exists (e.g.
  `add_to_dnc`, not a direct `dnc_list` insert) — the RPC owns normalization and
  invariants that the enforcement path depends on.

**Migrations:** don't write one for something that already exists — check the live DB
first (above), and use `IF NOT EXISTS` regardless. When you do add a column, apply the
migration against the linked project and note the change in `docs/SYSTEM_STATE.md`; a
committed migration file is not evidence it ran. A migration sat unapplied for a full
day this way while the deployed code wrote to a column that didn't exist yet.

## QA Communication Guidelines
When the user provides a QA checklist with categories:
- If a category is marked **"Undefined"**, everything listed under that category (until the next category) represents items that need to be **asked about or clarified** before implementation
- These are features/functionality that may be missing, unclear, or need definition
- Always confirm requirements for "Undefined" items before building

## What Is This
HyveWyre is a multi-tenant SaaS SMS marketing and lead management platform for any industry with outreach needs — insurance, real estate, solar, roofing, financial services, home services, etc. Users can also port/add numbers to simply manage existing client communications.

## Subscription Tiers
- **Growth** ($30/mo, 3K credits) — standard tier
- **Scale** ($98/mo, 10K credits) — premium tier with 30% point pack discount
- No free tier. New unpaid accounts use a "preview" state (0 credits, no access) and are redirected to onboarding to pick a plan.
- One-time point packs available (4K–60K points) via Stripe
- NOTE: Tier naming is currently inconsistent in code (basic/premium vs starter/professional). Standardize to **Growth/Scale** — "Scale" implies the user is growing and needs more, which drives upsells.

## Payments & Billing
- **Payment required at signup** — no free tier, no trial. User must enter card and subscribe during onboarding.
- Stripe handles all payments: subscriptions + one-time point packs.
- Plan management (upgrade/downgrade) lives inside Settings page.

## Credits / Points System
- Growth tier: 3K credits/mo. Scale tier: 10K credits/mo.
- Costs: 1pt per SMS, 2pt per bulk message, 2pt per AI response, 5pt per doc upload, 15pt per flow creation
- One-time point packs available (4K–60K points) via Stripe
- **Scale tier gets a discount on point packs** — this is the ONLY difference between tiers besides monthly credits. Must be clearly shown on the website.
- **When user runs out of credits:** all SMS/AI features stop. User is prompted to buy a point pack. Cannot send until they purchase.
- **Auto-buy option:** user can enable auto-purchase and pick which point pack to auto-buy when they hit zero.

## Onboarding Flow
1. User creates account (no free option — paid plans only)
2. Asked demographic questions (industry, business type, etc.)
3. Given a free **shared toll-free** number from the pool. **Not local** — a local
   number requires the agent's own 10DLC brand and campaign to be submitted and
   approved first, so it cannot be a day-one thing (#1, #18, #120). This said
   "local" for a long time while the product gave toll-free; onboarding inventory
   is therefore a hard cap on signups, and `lib/numberPoolInventory.ts` alerts
   before the pool runs dry.
4. Guided to set up their AI Flows and Receptionist based on their industry
5. Shown industry-specific preset pipeline stages (user can customize)
6. Optionally connect Google Calendar

## Leads vs Clients — Two Distinct Concepts
- **Leads** = prospects being worked. Use **Flows** (AI conversation templates) to qualify them.
- **Clients** = sold/closed customers. Use **Receptionist** (AI auto-responder) for ongoing communication.
- A lead becomes a client when the **user manually marks them as sold**.
- Messages view has two separate sections: lead conversations and client conversations (tabs recommended for UX).
- Dashboard shows both but in distinct sections.

## Core User Flow (Leads)
1. Import leads (CSV/Excel/PDF/manual entry) or receive inbound texts
2. Assign leads to a Campaign (lead type category) and tag them (prospecting stage)
3. Send outbound SMS — individual, bulk, or drip sequences
4. When a lead replies, user chooses whether AI Flow takes over automatically or stays manual (configurable per campaign)
5. AI Flow gathers required info → books appointment → auto-tags lead as "appointment set"
6. Appointment shows on dashboard + Google Calendar (if connected)
7. User marks lead as "sold" → lead moves to Clients

## Core User Flow (Clients)
1. Client texts the user's number
2. AI Receptionist responds automatically (greeting, business hours, after-hours messages)
3. User can jump in and take over at any time
4. Ongoing relationship management — no qualification needed

## Tech Stack
- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL + Row Level Security + Auth)
- **SMS Provider:** Telnyx (primary) — Twilio code exists but is legacy, do not remove
- **AI:** OpenAI GPT-4o-mini
- **Payments:** Stripe (subscriptions + one-time point packs)
- **Calendar:** Google Calendar API (OAuth)
- **Deployment:** Vercel

## Key Pages (Authenticated / Dashboard)
- `/dashboard` — scrollable sections: upcoming appointments, unread messages, pipeline overview (lead counts by stage)
- `/leads` — lead contact list with campaign assignment, tagging, scoring, filtering, bulk actions
- `/clients` — sold/active customer list, managed by Receptionist AI
- `/texts` — conversation inbox with tabs for Lead conversations and Client conversations (a thin wrapper around `components/texts/TextsLayout.tsx`; a superseded 1177-line `/messages` page was deleted in #89 — this is the live one)
- `/campaigns` — categorize what kind of lead a person is (health, life, auto, home, solar, etc.)
- `/flows` — AI conversation templates (industry presets + custom builder) for qualifying leads and booking appointments
- `/phone-numbers` — search/purchase local numbers via Telnyx (porting planned pre-launch)
- `/points` — credit balance, transaction history, buy point packs
- `/settings` — profile info, plan management (upgrade/downgrade), spam protection, DNC list, auto-buy config
- `/receptionist` — AI auto-reply config for clients and inbound leads (not outbound prospecting)
- `/analytics` — full reporting: delivery rates, response rates, campaign performance, credits over time, charts, export
- `/admin` — user management, spam monitoring, usage analytics (owner-only, no team/roles needed)

## Key Pages (Public)
- `/preview` — full landing page: hero, features, pricing table (Growth vs Scale), testimonials, CTA to sign up
- `/opt-in` — generic compliance proof page (not per-user branded), documents that HyveWyre collects consent
- Auth: login, register, forgot-password, onboarding
- Legal: privacy, terms, compliance, refund policy

## Feature Definitions

### Receptionist
- AI auto-responder for CLIENTS (sold) and inbound leads who texted the number first
- NOT used for outbound prospecting
- Configurable business hours, after-hours message, greeting, system prompt
- User can take over at any time

### Flows (AI Templates)
- AI conversation templates used to **prospect leads and gather information**
- The AI asks questions defined in the flow and **saves the answers to the lead record**
- Required questions: industry defaults (insurance = DOB/household/income, real estate = budget/area, etc.)
- User can customize which questions the flow asks
- Industry-specific presets available + user can build custom flows from scratch
- Flow steps guide the conversation: introduction → qualifying questions → objection handling → appointment booking
- When all required info is gathered → appointment booked → lead auto-tagged "appointment set"
- Gathered info is stored on the lead for the user to review
- User can configure AI autonomy: full auto, suggest replies, or manual
- User can jump in and take over any conversation at any time

### Campaigns
- A **group of leads** that you work together for bulk outreach
- Add leads to a campaign → send bulk messages → track stats
- Campaign stats: lead count, messages sent, credits used
- Can apply tags to all leads in a campaign at once
- Example: "January Solar Leads" campaign with 500 leads to message

### Tags
- Mark where a lead is in the **prospecting pipeline**
- Multiple tags per lead, with one PRIMARY tag showing current stage
- Preset tags per industry (e.g., insurance: new, contacted, qualified, quoted, appointment set)
- User can customize their own pipeline stages
- Examples: new → contacted → qualified → quoted → appointment set → sold
- Tags are independent from campaigns — a lead in any campaign can have any tag

### Pipeline Stages (Dashboard)
- Industry-specific presets loaded during onboarding
- User can customize stages
- Dashboard shows lead counts per stage in a visual pipeline view

## Inbound Lead Handling
- When someone texts the user's number for the first time → AI Receptionist greets them
- User can then assign them as a lead (move to Flows) or keep as client (stays with Receptionist)

## Opt-Out / DNC (Compliance)
- When a lead texts STOP → added to DNC list → completely blocked from receiving any future messages
- Lead record stays in system but is permanently locked from messaging (legal requirement)
- No ability to message them again, ever
- DNC list is user-specific + global
- First message to a lead auto-appends opt-out footer; subsequent messages do not
- Spam detection scores messages pre-send
- Admin can suspend/ban users for violations

## AI Behavior
- Industry-specific default tone (professional for insurance/finance, friendly for home services, etc.)
- User can customize their AI's system prompt / personality on top of the industry default
- Guardrails: AI should never make promises, give legal/medical advice, or discuss pricing unless configured to

## Browser Extension (MVP at Launch)
- Collects info from whatever platform the user is browsing (social media, directories, websites, etc.)
- Captures client/lead contact info and imports into HyveWyre
- Allows sending a message directly from the extension
- MVP: basic scraping + import + quick send. Polish post-launch.

## Notifications
- User configures which notifications they want and how they receive them
- Channels: in-app (notification bell/badge), email, SMS to personal phone
- Notification types: new messages, appointments, low credits, opt-outs, AI handoff requests
- User picks per-notification-type which channels are active

## Mobile
- Web-only for launch (responsive design)
- Native iOS/Android app planned for post-launch

## Phone Numbers
- New numbers purchased via Telnyx during onboarding (one free with plan)
- Additional numbers available for purchase
- Number porting (bring your own number) planned for pre-launch
- Geo-routing: system picks the closest local number to each lead's zip code

## Data Model (Core Entities)
- **Users** — auth via Supabase, subscription tier (Growth/Scale), credits balance, industry, demographic info
- **Leads** — prospects with campaign type (lead category), tags (prospecting stage, multiple + primary), flow assignment
- **Clients** — sold/active customers managed by Receptionist AI
- **Threads** — conversation groupings by phone number / lead or client
- **Messages** — SMS records (inbound/outbound), spam score, delivery status
- **Campaigns** — lead type categories (health, life, auto, solar, etc.)
- **Tags** — prospecting stage markers with industry presets + custom (multiple per lead, one primary)
- **Flows** — AI conversation templates with required fields, industry presets + custom builder
- **Pipeline Stages** — user-configurable stages with industry defaults
- **Appointments** — booked via Flows, shown on dashboard + Google Calendar
- **Points Transactions** — earn/spend/purchase log with Stripe session tracking
- **User Telnyx Numbers** — purchased phone numbers with geo data
- **DNC List** — permanent do-not-call entries, blocked from all messaging
- **Receptionist Settings** — AI config for client/inbound conversations
- **Drip Campaigns** — multi-step automated sequences with triggers
- **AI Drips** — AI-generated follow-ups with quiet hours (9pm–9am EST)

## Important Notes
- **Twilio has been completely removed** — all SMS goes through Telnyx only
- `PROVIDER_NOTE.md` documents the Telnyx migration
- `scripts/` contains useful one-time utilities — keep
- `browser-extension/` is a separate feature — keep
- Test pages (`/test-ai`, `/test-points`) are useful for dev — keep
- Tier naming in code needs standardization: rename all basic/starter → "growth", all premium/professional → "scale"

## Key Files

### API Routes
- `/api/sms/send` - Send individual SMS
- `/api/telnyx/sms-webhook` - Inbound SMS webhook
- `/api/messages/schedule` - Schedule messages (GET/POST/DELETE)
- `/api/messages/schedule/bulk` - Bulk schedule/cancel/send
- `/api/cron/process-scheduled` - Cron for scheduled messages + campaigns
- `/api/cron/process-drips` - Cron for drip campaigns
- `/api/cron/process-ai-drips` - Cron for AI drips
- `/api/campaigns/run` - Run bulk campaign
- `/api/follow-ups` - CRUD for follow-ups
- `/api/follow-ups/send-calendar-link` - Send calendar booking link
- `/api/flows` - CRUD for AI conversation flows

### Components
- `components/BulkComposeDrawer.tsx` - Bulk SMS drawer (used on Texts, Leads, Campaigns)
- `components/texts/TextsLayout.tsx` - Main texts/messages layout
- `components/texts/Composer.tsx` - Message composer with scheduling
- `components/Sidebar.tsx` - Navigation sidebar

### Lib
- `lib/telnyx.ts` - `sendTelnyxSMS()` function
- `lib/templateUtils.ts` - Variable extraction and substitution
- `lib/creditCalculator.ts` - SMS credit calculation
- `lib/spam/detector.ts` - Spam detection
- `lib/geo/selectClosestNumber.ts` - Geo-routing for numbers

---

## Database Schema (Supabase PostgreSQL)

All tables use Row Level Security (RLS) with `user_id` filtering. Users can only access their own data.

### Core Tables

#### `users` (via auth.users + public.users)
- `id` UUID - Primary key (from Supabase Auth)
- `email` TEXT - User email
- `full_name` TEXT - Display name
- `phone_number` TEXT - Personal phone
- `business_name` TEXT - Business name
- `credits` INTEGER - Current credit balance
- `subscription_tier` TEXT - 'growth' or 'scale'
- `stripe_customer_id` TEXT - Stripe customer ID
- `timezone` TEXT - User timezone
- `quiet_hours_enabled` BOOLEAN - Quiet hours on/off
- `quiet_hours_start` TIME - Start of quiet period
- `quiet_hours_end` TIME - End of quiet period

#### `leads`
- `id` UUID - Primary key
- `user_id` UUID - Owner reference
- `first_name`, `last_name` TEXT - Name
- `phone` TEXT - Phone number (required for SMS)
- `email` TEXT - Email address
- `tags` TEXT[] - Array of tag names
- `status` TEXT - Lead status
- `campaign_id` UUID - Associated campaign
- `source` TEXT - Lead source
- `zip_code` TEXT - For geo-routing
- `last_interaction_at` TIMESTAMPTZ - last outreach. **There is no
  `last_contacted`** (#112); code reading it gets undefined and silently falls
  back to `created_at`
- `last_engaged` TIMESTAMPTZ, `interaction_count` INTEGER
- `sms_opt_in` BOOLEAN - true / false (opted out) / **NULL (unknown)**. No longer
  defaults to true (#130)
- `consent_source` TEXT - `opt_in_form` | `agent_attested` | `inbound_message` |
  `legacy_unknown`. What established consent; NULL means nothing did
- `consent_recorded_at` TIMESTAMPTZ
- `created_at`, `updated_at` TIMESTAMPTZ

#### `clients`
- Same structure as leads
- Represents sold/converted customers
- Uses Receptionist AI instead of Flows

#### `threads`
Verified against the live database 2026-08-03 (#112). Three of the entries that
used to be here did not exist: `ai_enabled`, `contact_type` and `last_message_at`.

- `id` UUID - Primary key
- `user_id` UUID - Owner reference
- `lead_id` UUID - Associated lead/client
- `lead_name` TEXT, `lead_phone` TEXT - denormalised copies from the lead
- `phone_number` TEXT - the CONTACT's number, not ours. Nothing records which of
  our numbers a thread uses; that is derived from `messages.from_phone` (#129)
- `channel` TEXT - 'sms' or 'email'
- `status` TEXT - default 'active'
- `is_archived` BOOLEAN / `archived_at` TIMESTAMPTZ - archiving lives here, not in `status`
- `campaign_id` UUID - Associated campaign
- `messages_from_user` INTEGER - Outbound count
- `messages_from_lead` INTEGER - Inbound count
- `last_message` TEXT / `last_message_snippet` TEXT - preview text
- `last_sender` TEXT, `unread` BOOLEAN
- `updated_at` TIMESTAMPTZ - **use this for "when did this thread last move".**
  There is no `last_message_at`
- `conversation_tags` TEXT[] - default `{}`
- `flow_step` JSONB, `pending_ai_draft` TEXT
- **`ai_disabled` BOOLEAN, default false** - note the polarity. There is no
  `ai_enabled`, and writing `ai_enabled: false` to mean "AI off" would mean the
  opposite if it ever existed. `/api/threads/[id]` accepts `ai_enabled` in its
  request body and inverts it (#109)

**`contact_type` is computed, never stored.** `app/api/texts/threads/route.ts`
derives it per thread by cross-referencing the `clients` table. Do not add it to
a query — see the comment in `threads/bulk-ai-toggle/route.ts`.

#### `messages`
- `id` UUID - Primary key
- `user_id` UUID - Owner reference
- `thread_id` UUID - Parent thread
- `lead_id` UUID - Associated lead
- `direction` TEXT - 'inbound' or 'outbound'
- `body` / `content` TEXT - Message content
- `status` TEXT - 'sent', 'delivered', 'failed'
- `channel` TEXT - 'sms' or 'email'
- `provider` TEXT - 'telnyx'
- `message_sid` TEXT - Provider message ID
- `spam_score` INTEGER - Spam detection score
- `spam_flags` TEXT[] - Detected spam words
- `is_automated` BOOLEAN - Sent by automation
- `automation_source` TEXT - 'scheduled', 'drip', 'bulk_campaign', 'ai_drip'
- `created_at` TIMESTAMPTZ

### Scheduling & Automation Tables

#### `scheduled_messages`
- `id` UUID - Primary key
- `user_id` UUID - Owner
- `lead_id` UUID - Recipient
- `channel` TEXT - 'sms' or 'email'
- `body` TEXT - Message content
- `scheduled_for` TIMESTAMPTZ - When to send
- `status` TEXT - 'pending', 'sent', 'failed', 'cancelled'
- `source` TEXT - 'manual', 'drip', 'campaign', 'bulk'
- `campaign_id` UUID - Associated campaign
- `credits_cost` INTEGER - Credits needed
- `segments` INTEGER - SMS segment count
- `sent_at` TIMESTAMPTZ
- `error_message` TEXT

#### `scheduled_campaigns`
- Batch campaigns with progressive sending
- `lead_ids` UUID[] - Array of leads to message
- `percentage_per_batch` INTEGER - % to send each batch
- `interval_hours` INTEGER - Time between batches
- `next_batch_date` TIMESTAMPTZ

#### `drip_campaigns`
- Multi-step automated sequences
- `trigger_type` TEXT - 'manual', 'no_reply', 'tag_added', 'status_change', 'lead_created'
- `trigger_config` JSONB - Trigger settings

#### `drip_campaign_steps`
- Individual messages in a drip
- `delay_days`, `delay_hours` INTEGER - Wait time
- `content` TEXT - Message template

#### `drip_campaign_enrollments`
- Tracks lead enrollment in drips
- `current_step` INTEGER - Progress
- `next_send_at` TIMESTAMPTZ - Next message time

#### `ai_drips`
- AI-generated follow-up sequences
- `interval_hours` INTEGER - Between messages (default 6)
- `max_messages` INTEGER - Limit (default 5)
- `next_send_at` TIMESTAMPTZ
- Auto-stops when lead replies

### Follow-ups & Appointments

#### `follow_ups`
- `lead_id` UUID - Associated lead
- `title` TEXT - Follow-up title
- `due_date` TIMESTAMPTZ - When due
- `status` TEXT - 'pending', 'completed', 'cancelled'
- `priority` TEXT - 'low', 'medium', 'high', 'urgent'
- `reminder_type` TEXT - 'manual', 'auto_no_response', etc.

#### `calendar_events`
- Appointments booked via Flows
- Synced with Google Calendar if connected

### Campaigns & Tags

#### `campaigns`
- Groups of leads for bulk outreach
- `name` TEXT - Campaign name (e.g., "January Solar Leads")
- `lead_ids` UUID[] - Array of leads in this campaign
- `total_leads` INTEGER - number of leads. **Not `lead_count`** — that name does
  not exist as a column; `/api/campaigns` computes a `lead_count` field into its
  response, which is what made the doc look right (#112)
- `tags` TEXT[] - tags applied to leads in this campaign. **Not `tags_applied`**
- `messages_sent` INTEGER - Total messages sent
- `credits_used` INTEGER - Total credits spent

#### `tags`
- User-defined tags
- `name` TEXT - Tag name (unique per user)
- `color` TEXT - Display color

### Phone Numbers

#### `user_telnyx_numbers`
- `phone_number` TEXT - E.164 format
- `friendly_name` TEXT - Display name
- `status` TEXT - 'active', 'inactive', 'pending'
- `is_primary` BOOLEAN - Default sending number
- `messaging_profile_id` TEXT - Telnyx profile

### AI & Flows

#### `conversation_flows`
- AI conversation templates for prospecting leads
- `name` TEXT - Flow name (e.g., "Insurance Qualification")
- `steps` JSONB - Conversation steps with messages and responses
- `context` JSONB - Flow context (what you're offering, target audience)
- `required_questions` TEXT[] - Questions AI must ask and save answers for
- `requires_call` BOOLEAN - Whether booking requires a phone call
- Answers gathered are saved to the lead record

#### `user_preferences`
- User settings
- `calendar_booking_url` TEXT - Calendly/booking link
- `calendar_type` TEXT - 'calendly', 'google', 'both'
- `theme` TEXT - UI theme
- `enable_smart_replies` BOOLEAN
- `enable_ai_suggestions` BOOLEAN

---

## Key RPC Functions (Supabase)

### Scheduled Messages
- `get_messages_ready_to_send()` - Returns pending messages where scheduled_for <= NOW()
- `get_campaigns_ready_for_batch()` - Returns campaigns ready for next batch
- `schedule_message(user_id, lead_id, body, scheduled_for)` - Creates scheduled message

### Drip Campaigns
- `get_drip_enrollments_ready_to_send()` - Returns enrollments ready for next step

### AI Drips
- `get_ai_drips_ready_to_send()` - Returns active drips ready to send
- `stop_ai_drip_on_reply(phone)` - Stops drip when lead replies

### Credits
- `deduct_credits(user_id, amount)` - Deducts credits from user

### DNC
- `check_dnc(user_id, phone)` - Checks if number is on do-not-call list

### Quiet Hours
- `is_within_quiet_hours(user_id, check_time)` - Checks if time is within business hours

---

## Cron Jobs (Vercel Cron / External)

### `/api/cron/process-scheduled` (every 5 min)
1. Validates CRON_SECRET header
2. Calls `get_messages_ready_to_send()` RPC
3. For each message:
   - Checks quiet hours
   - Checks user credits
   - Gets user's primary Telnyx number
   - Sends via `sendTelnyxSMS()`
   - Deducts credits
   - Creates message record
   - Updates scheduled_message status
4. Calls `get_campaigns_ready_for_batch()` RPC
5. Processes campaign batches similarly

### `/api/cron/process-drips` (every 5 min)
1. Calls `get_drip_enrollments_ready_to_send()` RPC
2. For each enrollment:
   - Gets next step content
   - Personalizes message with lead data
   - Sends via Telnyx
   - Advances enrollment to next step or marks completed

### `/api/cron/process-ai-drips` (every 5 min)
1. Calls `get_ai_drips_ready_to_send()` RPC
2. For each drip:
   - Generates AI follow-up message
   - Checks quiet hours (9pm-9am EST blocked)
   - Sends via Telnyx
   - Updates drip stats
   - Schedules next send

---

## SMS Flow (Telnyx)

### Outbound
1. User composes message (individual, bulk, or scheduled)
2. Credits checked before send
3. DNC list checked
4. Spam score calculated
5. `sendTelnyxSMS()` called with:
   - `to`: Lead phone
   - `message`: Content
   - `from`: User's primary Telnyx number
6. Message logged to database
7. Thread updated

### Inbound (Webhook)
1. Telnyx sends POST to `/api/telnyx/sms-webhook`
2. Lookup user by `to` number in `user_telnyx_numbers`
3. Find or create thread
4. Find or create lead
5. Save message to database
6. Stop any active AI drips for this phone
7. If AI enabled on thread:
   - Generate AI response
   - Send reply
8. Update thread stats

---

## Template Variables

### Campaign Messages
- `{{first}}` - Lead first name
- `{{last}}` - Lead last name
- `{{email}}` - Lead email
- `{{phone}}` - Lead phone
- `{{state}}` - Lead state

### Flow Templates
- `{first_name}`, `{last_name}`, `{full_name}`
- `{email}`, `{phone}`, `{company}`
- `{agent_name}`, `{agent_email}`, `{agent_phone}`

### AI System Prompts
- `{{leadName}}`, `{{leadFirstName}}`
- `{{leadLocation}}`, `{{leadStatus}}`, `{{leadTags}}`
- `{{flowGuidance}}` - Current step instructions

---

## Where the work is tracked

**Open work lives in GitHub Issues, not here.** This section used to carry the full
backlog and grew to a third of the file — which mattered, because CLAUDE.md is
loaded into every turn of every session and Claude Code warns past 40k characters.

```bash
gh issue list --repo tripptrap/trippdrip-v8-sprint1
gh issue list --repo tripptrap/trippdrip-v8-sprint1 --label compliance
```

Milestones: **Pre-Launch** blocks shipping; **Post-Launch Roadmap** does not.
Useful labels: `compliance`, `billing`, `bug`, `retention`, `dark-mode`, `ux`.

**For how the system actually behaves right now** — what is confirmed working,
what is confirmed broken, and the traps that have already cost real time — read
[`docs/SYSTEM_STATE.md`](docs/SYSTEM_STATE.md). That is the file to check before
non-trivial work, and the one to update afterwards. This file describes what the
product is *supposed* to be; SYSTEM_STATE describes what it *is*.

**For a fast read on whether anything is broken right now:**

```bash
npm run health
```

Eleven assertions over the live system — cron freshness, number-pool inventory,
delivery receipts, charge/ledger reconciliation, DNC integrity, RLS coverage,
credit-RPC exposure, SECURITY DEFINER search_path hygiene, Telnyx balance and TFV
status. Exits non-zero on failure. Most bugs found here were silent, so these are
assertions rather than things somebody remembers to check.

The completed history that used to live here is in git and in the closed issues.
