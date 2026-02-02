# HyveWyre - Project Context

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
- `/messages` — conversation inbox with tabs for Lead conversations and Client conversations
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

### Flows
- AI conversation templates used for LEADS (prospects)
- Purpose: gather required info from a lead before booking an appointment
- Required info before booking: industry defaults (insurance = DOB/household/income, real estate = budget/area, etc.) + user can add/remove required fields
- Industry-specific presets available + user can build custom flows from scratch
- When a Flow completes → appointment booked → lead auto-tagged "appointment set" → shows on dashboard + Google Calendar
- User can configure AI autonomy per flow: full auto, suggest replies, or manual
- User can jump in and take over any conversation at any time; AI stops or switches to suggest mode (user's choice in settings)

### Campaigns
- Categorize what KIND of lead a person is (health, life, auto, home, solar, roofing, etc.)
- Used to segment leads by product/industry type
- Independent from tags — a "health" campaign lead can be tagged "quoted"

### Tags
- Track where a lead is in the PROSPECTING stage
- Multiple tags per lead, with one PRIMARY tag showing current stage
- Preset tags per industry (e.g., insurance: income, household size, quoted, appointment set)
- User can customize their own pipeline stages
- Examples: new → contacted → qualified → quoted → appointment set → sold

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
- Twilio code is legacy but still wired into API routes — do not delete
- `PROVIDER_NOTE.md` documents the Telnyx migration
- `scripts/` contains useful one-time utilities — keep
- `browser-extension/` is a separate feature — keep
- `public/a66f91bd3e361605821f51895b6d857e.html` is a domain verification file — keep
- Test pages (`/test-ai`, `/test-points`) are useful for dev — keep
- Tier naming in code needs standardization: rename all basic/starter → "growth", all premium/professional → "scale"

---

## TODO (Persistent — update as tasks are completed or added)
**ALL items below are PRE-LAUNCH requirements unless marked as "Roadmap".**

### Completed
- [x] Remove unused files from project (backup files, images, components, lib files, markdown docs)
- [x] Archive SQL migrations to `migrations/archive/`
- [x] Update `.gitignore` (tsconfig.tsbuildinfo, *.backup, *.bak)
- [x] Remove `tsconfig.tsbuildinfo` from git tracking
- [x] Document project context in CLAUDE.md

### In Progress
_(nothing currently in progress)_

### Pre-Launch — Code Cleanup
- [x] Standardize tier naming: rename all basic/starter → "growth", all premium/professional → "scale" across entire codebase
- [x] Fix inconsistent subscription tier type (`SubscriptionTier` uses preview/starter/professional, other code uses basic/premium/free)
- [x] Remove "preview"/"free" tier references — replace with a single "unpaid" state concept

### Pre-Launch — Payments & Billing
- [ ] Enforce payment at signup — no access without subscribing (card required during onboarding)
- [ ] Show Scale tier point pack discount clearly on pricing/preview pages
- [ ] Out-of-credits blocker: stop all SMS/AI features, prompt user to buy a point pack
- [ ] Auto-buy feature: user enables auto-purchase, picks which pack to auto-buy at zero credits
- [ ] Plan management (upgrade/downgrade) inside Settings page

### Pre-Launch — Settings Page
- [ ] Profile info section (name, email, business info)
- [ ] Plan management section (current plan, upgrade/downgrade, billing)
- [ ] Spam protection settings
- [ ] DNC list management
- [ ] Auto-buy configuration (enable/disable, pick pack size)

### Pre-Launch — Onboarding Rework
- [ ] Add demographic questions to onboarding (industry, business type)
- [ ] Auto-provision one free local number during onboarding
- [ ] Guide user to set up AI Flows based on their industry
- [ ] Show industry-specific preset pipeline stages (user can customize)
- [ ] Add optional Google Calendar connection step

### Pre-Launch — Leads vs Clients Separation
- [ ] Create Clients concept — separate from Leads
- [ ] Add "mark as sold" action on leads to convert to client
- [ ] Create `/clients` page for managing sold/active customers
- [ ] Split messages view into Lead conversations and Client conversations (tabs)
- [ ] Route Leads → Flows AI, Clients → Receptionist AI

### Pre-Launch — Flows (AI Conversation Templates)
- [ ] Build Flow system — AI templates that gather info before booking appointments
- [ ] Industry-specific flow presets (insurance = DOB/household/income, real estate = budget/area, etc.)
- [ ] Custom flow builder (user can create from scratch)
- [ ] Configurable required fields per flow
- [ ] AI autonomy settings per flow (full auto, suggest replies, manual)
- [ ] User can take over conversation at any time (AI stops or switches to suggest mode)
- [ ] Flow completion → auto-book appointment → auto-tag "appointment set"
- [ ] Flow trigger config: user chooses auto-on-reply or manual assignment per campaign

### Pre-Launch — Dashboard Rework
- [ ] Scrollable sections layout: appointments → unread messages → pipeline overview
- [ ] Upcoming appointments section (from Flows + Google Calendar)
- [ ] Unread messages section (leads + clients)
- [ ] Pipeline overview — lead counts by stage (visual pipeline view)
- [ ] Separate lead and client sections

### Pre-Launch — Tags & Pipeline
- [ ] Support multiple tags per lead with one primary tag
- [ ] Industry-specific preset tags loaded during onboarding
- [ ] User can customize their own pipeline stages
- [ ] Pipeline stages shown on dashboard

### Pre-Launch — Campaigns Rework
- [ ] Redefine campaigns as lead type categories (health, life, auto, solar, etc.)
- [ ] Campaigns independent from tags
- [ ] Campaign determines which Flow presets are available

### Pre-Launch — Compliance / DNC
- [ ] Opt-out (STOP) = permanent DNC, completely blocked from all future messaging
- [ ] Lead record stays but is permanently locked — no ability to message again
- [ ] Verify current DNC implementation matches this behavior

### Pre-Launch — Phone Numbers
- [ ] One free number provisioned with plan during onboarding
- [ ] Number porting (bring your own number) — before launch

### Pre-Launch — Analytics / Reporting
- [ ] Build `/analytics` page with full reporting
- [ ] Message delivery rates and response rates
- [ ] Campaign performance breakdowns
- [ ] Credits usage over time
- [ ] Charts and data visualization
- [ ] Export functionality

### Pre-Launch — AI Behavior
- [ ] Industry-specific default tone presets
- [ ] User-customizable system prompt / AI personality
- [ ] AI guardrails (no promises, no legal/medical advice, no pricing unless configured)

### Pre-Launch — Preview / Landing Page
- [ ] Full landing page: hero, features section, pricing table (Growth vs Scale), testimonials, CTA
- [ ] Clearly show Scale tier point pack discount as key differentiator

### Pre-Launch — Browser Extension (MVP)
- [ ] Scrape contact info from any platform the user is browsing
- [ ] Import captured info into HyveWyre as a lead/client
- [ ] Quick-send a message from the extension

### Pre-Launch — Notifications
- [ ] User-configurable notification preferences (per notification type)
- [ ] In-app notifications (bell/badge in dashboard)
- [ ] Email alerts
- [ ] SMS alerts to user's personal phone
- [ ] Notification types: new messages, appointments, low credits, opt-outs, AI handoff requests

### Pre-Launch — Other
- [ ] Google Calendar integration for appointment booking from Flows
- [ ] AI suggest-reply mode (AI drafts, user reviews and sends)
- [ ] Inbound lead handling: Receptionist greets → user assigns as lead or client
- [ ] Admin panel updates to reflect new tier names and lead/client separation
- [ ] Opt-in page as generic compliance proof

### Roadmap (Post-Launch)
- [ ] Native iOS/Android mobile app
- [ ] Browser extension polish and advanced features
- [ ] Per-user branded opt-in pages
- [ ] Team/role-based admin access
