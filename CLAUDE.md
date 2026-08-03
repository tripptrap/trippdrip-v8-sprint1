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
3. Given a free local phone number with their plan
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

## TODO (Persistent — update as tasks are completed or added)
**ALL items below are PRE-LAUNCH requirements unless marked as "Roadmap".**

### Completed
- [x] Remove unused files from project (backup files, images, components, lib files, markdown docs)
- [x] Archive SQL migrations to `migrations/archive/`
- [x] Update `.gitignore` (tsconfig.tsbuildinfo, *.backup, *.bak)
- [x] Remove `tsconfig.tsbuildinfo` from git tracking
- [x] Document project context in CLAUDE.md
- [x] Standardize tier naming: rename all basic/starter → "growth", all premium/professional → "scale"
- [x] Fix inconsistent subscription tier type
- [x] Remove "preview"/"free" tier references — replace with "unpaid" state
- [x] Enforce payment at signup (card required during onboarding)
- [x] Show Scale tier point pack discount clearly on pricing/preview pages
- [x] Auto-buy feature: user enables auto-purchase, picks which pack to auto-buy at zero credits
- [x] Plan management (upgrade/downgrade) inside Settings page
- [x] Settings: Profile info section (name, email, business info)
- [x] Settings: Plan management section (current plan, upgrade/downgrade, billing)
- [x] Settings: Spam protection settings
- [x] Settings: DNC list management
- [x] Settings: Auto-buy configuration (enable/disable, pick pack size)
- [x] Onboarding: Add demographic questions (industry, business type)
- [x] Onboarding: Auto-provision one free local number
- [x] Onboarding: Guide user to set up AI Flows based on industry
- [x] Onboarding: Show industry-specific preset pipeline stages (customizable)
- [x] Onboarding: Add optional Google Calendar connection step
- [x] Create Clients concept — separate from Leads
- [x] Add "mark as sold" action on leads to convert to client
- [x] Create `/clients` page for managing sold/active customers
- [x] Split messages view into Lead conversations and Client conversations (tabs)
- [x] Route Leads → Flows AI, Clients → Receptionist AI
- [x] Build Flow system — AI templates that gather info before booking appointments
- [x] Industry-specific flow presets (insurance, real estate, solar, etc.)
- [x] Custom flow builder (user can create from scratch)
- [x] Configurable required fields per flow
- [x] User can take over conversation at any time (AI stops or switches to suggest mode)
- [x] Dashboard: Scrollable sections layout (appointments → unread → pipeline)
- [x] Dashboard: Upcoming appointments section (Flows + Google Calendar)
- [x] Dashboard: Unread messages section (leads + clients)
- [x] Dashboard: Pipeline overview — lead counts by stage (visual)
- [x] Dashboard: Separate lead and client sections
- [x] Industry-specific preset tags loaded during onboarding
- [x] User can customize their own pipeline stages
- [x] Pipeline stages shown on dashboard
- [x] Redefine campaigns as lead type categories (health, life, auto, solar, etc.)
- [x] Campaigns independent from tags
- [x] Campaign determines which Flow presets are available
- [x] Opt-out (STOP) = permanent DNC, completely blocked from all future messaging
- [x] Lead record stays but is permanently locked — no ability to message again
- [x] Verify current DNC implementation matches this behavior
- [x] One free number provisioned with plan during onboarding
- [x] Build `/analytics` page with full reporting
- [x] Message delivery rates and response rates
- [x] Campaign performance breakdowns
- [x] Credits usage over time
- [x] Charts and data visualization
- [x] Export functionality
- [x] Industry-specific default tone presets
- [x] User-customizable system prompt / AI personality
- [x] AI guardrails (no promises, no legal/medical advice, no pricing unless configured)
- [x] Clearly show Scale tier point pack discount as key differentiator
- [x] Browser extension: Scrape contact info from any platform
- [x] Browser extension: Import captured info into HyveWyre as a lead/client
- [x] User-configurable notification preferences (per notification type)
- [x] In-app notifications (bell/badge in dashboard)
- [x] Notification types: new messages, appointments, low credits, opt-outs, AI handoff requests
- [x] Google Calendar integration for appointment booking from Flows
- [x] Inbound lead handling: Receptionist greets → user assigns as lead or client
- [x] Opt-in page as generic compliance proof

- [x] Out-of-credits blocker: stop all SMS/AI features, prompt user to buy a point pack
- [x] AI autonomy settings per flow (full auto, suggest replies, manual)
- [x] Flow completion → auto-book appointment → auto-tag "appointment set"
- [x] Flow trigger config: user chooses auto-on-reply or manual assignment per campaign
- [x] Support multiple tags per lead with one primary tag
- [x] Number porting (bring your own number)
- [x] Full landing page: hero, features section, pricing table (Growth vs Scale), testimonials, CTA
- [x] Browser extension: Quick-send a message from the extension
- [x] Email alerts (notifications)
- [x] SMS alerts to user's personal phone (notifications)
- [x] AI suggest-reply mode (AI drafts, user reviews and sends)
- [x] Admin panel updates to reflect new tier names and lead/client separation
- [x] Deep audit: API routes, database schema, Telnyx integration — all findings fixed
- [x] Fix missing `capabilities` on `user_telnyx_numbers` rows (2026-07-28, commit `40c0320`) — crash on Phone Numbers page for +18134972176 was actually two bugs: (1) `GET /api/telnyx/numbers` rebuilt each row into a narrow object that dropped `id`/`capabilities`/`created_at` even though the DB query already selected them, so capabilities was `undefined` for every row regardless of DB state; (2) none of the 5 insert/upsert paths into `user_telnyx_numbers` ever set `capabilities`, so new rows were always null. Fixed both, plus added `supabase/migrations/fix_user_telnyx_numbers_capabilities.sql` to backfill existing null rows and add a column default — **this migration still needs to be run against the live DB** (no linked Supabase project in the sandbox that made the fix).

### In Progress
- [x] ~~**Number-purchase checkout session never fulfills after payment**~~ — **FIXED 2026-07-28, commit `b28e8cb`.** The webhook's `checkout.session.completed` handler had no branch for `phone_number` metadata at all, so the customer was charged and the number never ordered. Worse, that checkout uses `mode: 'subscription'`, so it fell through into the plan branch and would have been treated as a **Growth plan purchase** (granting 3000 credits). A fix had been written in worktree `priceless-kowalevski-e9b46d` but was left **uncommitted and never merged** — it was ported to main, and a real bug in it corrected (its `onConflict` named a constraint that doesn't exist; see next item). The new branch runs *before* the `session.mode` check — do not reorder it. Tested with signed Stripe events: unverified toll-free blocked before ordering, no plan-credit leak, idempotent on redelivery, won't reassign another user's number. See `docs/SYSTEM_STATE.md` → Phone Numbers.
- [x] ~~**STOP opt-outs were never persisted to the DNC list**~~ — **FIXED 2026-07-28, commit `b28e8cb`, GitHub #34.** TCPA-level: `dnc_list` had **0 rows in production** — no opt-out had ever been recorded, and leads who texted STOP kept receiving messages. Detection worked; both persistence writes failed silently (bad `onConflict` target + missing NOT NULL columns + unchecked error returns, so it logged success on every failure). The only surviving effect, `leads.sms_opt_in = false`, is read by **no send path**. Now uses the `add_to_dnc` RPC with a loud error check. Full mechanism and the rules it leaves behind are in `docs/SYSTEM_STATE.md` → SMS / Telnyx / 10DLC.
- [ ] **Verify the live Telnyx number-order leg of the checkout fix** — everything around it is tested, but the actual `POST /v2/number_orders` call in the `phoneNumberPurchase` branch of `app/api/stripe/webhook/route.ts` has **never been executed against real Telnyx**, because doing so places a real, billable number order. To verify: buy a **local** number (not toll-free — toll-free is correctly blocked while TFV is missing, see `docs/SYSTEM_STATE.md`) through the checkout path as a user with no active subscription, then confirm the number appears in `user_telnyx_numbers` with `status: 'pending'` and on the Telnyx account. **Requires the user's explicit go-ahead — this spends money and orders a real number.**
- [x] ~~Telnyx local number orders being denied~~ — **RESOLVED 2026-07-26**: root cause was the negative account balance (-$23.91), not a code or compliance issue. User added funds (balance now positive, ~$76 before test orders). Confirmed via live test: 1 local number (+18134972176, area code 813) and 3 toll-free numbers ordered successfully once balance was positive. Local orders are not gated by 10DLC campaign status at the ordering stage (only affects message throughput later).
- [x] ~~Add funds to Telnyx account balance~~ — done by user 2026-07-26.
- [ ] **10DLC campaign is APPROVED — one step left: assign the number.** The live campaign is
  `CAAP953` / `4b30019f-a9aa-5d53-15ff-8fab24597ea8` (brand `4b20019b-eba4-6bfd-8723-dca9058142e8`,
  VERIFIED). Verified 2026-07-30: `campaignStatus: MNO_PROVISIONED`, `isTMobileRegistered: true`,
  `isTMobileSuspended: false`, `failureReasons: null`, all seven MNOs APPROVED.
  **Corrected 2026-08-03: it is NOT true that "0 numbers are assigned".** Checked against
  `GET /10dlc/phone_number_campaigns/<number>`:
  - `+18135187997` **is** assigned to CAAP953 and can send.
  - `+18134972176` is assigned to nothing — this is the number #105 is about.
  - `+18887062631` (toll-free) is TFV **Verified** and can send.
  So the account has two numbers that can legitimately send. What is blocked is assigning
  **that one specific number**, not messaging as a whole.
  **Blocked as of 2026-07-30 (#105):** the assignment fails — AT&T and T-Mobile report
  *"Longcode cannot be added/deleted as it is already associated with another campaign"* while
  non-T-Mobile carriers accept it. One of the five dead campaigns still holds the number at
  carrier level, invisible through the API. Needs Telnyx support to clear it; the exact request
  to send is in #105. **Do not keep retrying** — tried twice with a full delete between, same
  result.
  **Do not use campaign `4b30019f-a63a-3fb0-9c87-1ff6d84e7ac6` (CJFUY00) as the reference — it is
  a superseded failed attempt.** Eight campaigns exist under this brand; six are dead. Reading the
  old id from this file sent a session down an appeal-and-resubmit path for a campaign that was
  already approved. Always list with
  `GET /10dlc/campaign?brandId=<id>` and take the one whose `campaignStatus` is `MNO_PROVISIONED`.
  History of every rejection and fix: [`docs/10DLC_REJECTION_HISTORY.md`](docs/10DLC_REJECTION_HISTORY.md).
- [x] Per-user branded opt-in pages (#21) — built as a hard prerequisite for per-agent 10DLC (see above), not post-launch roadmap. Live at `/opt-in/<slug>`. See `docs/10DLC_REJECTION_HISTORY.md` and `lib/optInConsent.ts`.

### Open Work — tracked in GitHub Issues
All open pre-launch bugs, compliance work, retention/pricing decisions, and roadmap items moved to GitHub Issues (2026-07-26) — this file was becoming too long to track against reliably. See https://github.com/tripptrap/trippdrip-v8-sprint1/issues, or `gh issue list --repo tripptrap/trippdrip-v8-sprint1`.

For *how things currently actually behave* (as opposed to a list of open tickets), see `docs/SYSTEM_STATE.md` — required reading before non-trivial work, see the top of this file.

- **Launch blocker, decided 2026-07-27**: rotate **all** production secrets before launch (#29) — Vercel flags many env vars "Needs Attention", most likely fallout from the April 2026 incident where non-"sensitive" variables were exposed. Deliberately deferred until launch prep. **Ordering constraint:** rotate `ENCRYPTION_KEY` *before* the first real number-port order exists, or the stored `account_pin` needs a decrypt/re-encrypt migration. Note the app running normally is not evidence the secrets are safe — leaked credentials keep working.
- **Pre-Launch milestone**: everything blocking launch — 10DLC per-agent restructuring (#1) and its dependents (#2, #3, #11), end-to-end QA (#17), and production verification (#18). Landing page accuracy pass (#33) — audit `/preview` against what the product actually does today. (#4 billing bug, #5 dark-mode pass, #6 /points balance, #7 floating button, #8 sidebar breakpoint, #9 analytics nav, #10 number-order webhook, #12-#15 downgrade/retention flow, and #16 email API key encryption are all closed — see issue history for what changed.)
- **Post-Launch Roadmap milestone**: native mobile app (#19), browser extension polish (#20), team/role-based admin access (#22). (#21, per-user branded opt-in pages, was pulled forward and completed 2026-07-27 — see "In Progress" above.)

Filter with `gh issue list --repo tripptrap/trippdrip-v8-sprint1 --label compliance` (or `billing`, `bug`, `retention`, `dark-mode`, `ux`) to narrow by category.
