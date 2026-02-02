# HyveWyre Telephony Provider: Telnyx

This project uses **Telnyx** as its SMS and voice provider — **not Twilio**.

## Legacy Twilio References

Legacy Twilio code still exists in approximately 66 files across the codebase. These references have not been removed to avoid unnecessary churn, but they should **not** be used for new work.

Key areas where Twilio references remain:

- `lib/` — helper modules and client wrappers
- `app/api/twilio/` — legacy webhook and API routes
- `scripts/` — maintenance and migration scripts
- SQL migrations — schema references and seed data
- `docs/` — older documentation

## Guidance for New Work

All new telephony features (SMS, voice, number management, etc.) must use the **Telnyx APIs and SDKs**. Do not introduce new Twilio dependencies or extend legacy Twilio code paths.

## Planned Features

### Inbound Call Forwarding (Telnyx)
When a client calls a user's Telnyx number, the call should be forwarded/redirected to the user's personal phone number. Implementation should use Telnyx Call Control API or TeXML to:
- Receive inbound call webhook from Telnyx
- Look up the Telnyx number owner in `user_telnyx_numbers`
- Forward the call to the user's personal phone (stored in user profile)
- Optionally play a whisper/announcement before connecting
- Log the call in the system for tracking

---

## Work Log

### 2026-02-01 — Session 1: Codebase Assessment & Provider Clarification

**What we did:**
- Navigated and assessed the full trippdrip-v8-sprint1 project (Next.js codebase)
- Discovered ~66 files still referencing Twilio across `lib/`, `app/api/twilio/`, `scripts/`, SQL migrations, and `docs/`
- Identified key Twilio files: `twilio.ts`, `twilioClient.ts`, `twilioSubaccounts.ts`, `twilioUsage.ts`, plus ~14 API routes under `app/api/twilio/`
- Confirmed the actual provider is **Telnyx**, not Twilio
- Decided against deleting legacy Twilio code to avoid breaking anything
- Created this `PROVIDER_NOTE.md` file as a reference point

**What's next:**
- Begin migrating Twilio references to Telnyx where appropriate
- Prioritize active code paths (API routes, lib clients) over inactive ones (old docs, migrations)
- Build out new telephony features using Telnyx SDKs/APIs
- Implement inbound call forwarding via Telnyx Call Control
- Gradually retire legacy Twilio routes and helpers as Telnyx replacements are confirmed working

---

## Back-Test Checklist for Launch

### Authentication & Account Flow
- [ ] 1. Registration — Sign up with email, password, phone, name, industry, use case
- [ ] 2. Login — Standard login with email/password
- [ ] 3. Forgot password — Reset flow sends email, link works
- [ ] 4. Onboarding — Plan selection (Basic/Premium) redirects to Stripe checkout
- [ ] 5. Auth callback — OAuth/email confirmation callback works
- [ ] 6. Suspended account login — Shows reason, unban date, support email
- [ ] 7. Banned account login — Shows permanent ban message with reason
- [ ] 8. Middleware redirects — Unauthenticated users redirect to login, no-plan users redirect to onboarding
- [ ] 9. Onboarding tour — Interactive tutorial guides new users through features
- [ ] 10. Onboarding congrats modal — Displays on completion of onboarding
- [ ] 11. Onboarding phone selector — Phone number selection during onboarding flow

### Dashboard
- [ ] 12. Dashboard home — Stats load, cards display correctly
- [ ] 13. Sidebar navigation — All links work, active state highlights
- [ ] 14. Dark mode toggle — Theme persists across pages
- [ ] 15. Demo mode — DemoModeBanner displays, demo data loads correctly

### Lead Management
- [ ] 16. View leads — List loads, pagination works
- [ ] 17. Create lead — Manual add with all fields
- [ ] 18. Edit lead — Inline or modal editing
- [ ] 19. Delete lead — Single and bulk delete
- [ ] 20. Import CSV — Upload CSV, mapping works, leads created
- [ ] 21. Export leads — Download works
- [ ] 22. Lead scoring — Scores calculate correctly
- [ ] 23. Lead disposition — Status changes (new, contacted, sold, etc.)
- [ ] 24. Lead tags — Add/remove tags
- [ ] 25. Lead notes — Add/view notes
- [ ] 26. Lead activities — Activity history displays
- [ ] 27. Lead priority — Set/change priority
- [ ] 28. Bulk update leads — Batch property changes via API
- [ ] 29. Recalculate all lead scores — Trigger score recalculation across leads
- [ ] 30. Lead upsert — Create or update without duplicating
- [ ] 31. Upload document to leads — PDF, DOCX, XLSX import and AI parsing
- [ ] 32. Points deduction for upload — 5 points deducted per document upload

### Phone Numbers
- [ ] 33. Search numbers — Telnyx number search by area code/state
- [ ] 34. Purchase number — Buy with credits, number appears in list
- [ ] 35. Number pool — Available numbers display, claim works
- [ ] 36. Release number — Remove number from account
- [ ] 37. Geo-routing — Closest number selected based on lead zip code
- [ ] 38. Number ownership validation — Can't send from unowned number
- [ ] 39. Telnyx number order webhook — Provisioning status confirmed via callback

### SMS Messaging (Texts Page)
- [ ] 40. Opt-out keyword modal — Appears on first visit if not configured, blocks until set
- [ ] 41. View conversations — Thread list loads, sorted by recent
- [ ] 42. Open thread — Messages display in order
- [ ] 43. Send SMS — Message sends via Telnyx, appears in thread
- [ ] 44. First message opt-out footer — "Reply STOP to opt out" appended on first message to new lead
- [ ] 45. Subsequent messages — No opt-out footer on follow-ups
- [ ] 46. SMS credit calculation — Character count and credit cost display
- [ ] 47. WhatsApp channel — Toggle between SMS/WhatsApp
- [ ] 48. Schedule message — Date/time picker, message queued
- [ ] 49. DNC blocking — Can't send to numbers on DNC list
- [ ] 50. Real-time polling — New messages appear without refresh
- [ ] 51. Notification sound — Plays on new inbound message
- [ ] 52. MMS support — Media attachment sending

### Conversation & Thread Management
- [ ] 53. Archive thread — Archiving works, thread moves to archived view
- [ ] 54. Unarchive thread — Restoring archived thread works
- [ ] 55. Bulk archive threads — Multi-select archive works
- [ ] 56. Conversation tags — Add/remove tags on threads
- [ ] 57. Recover deleted conversations — Recovery endpoint works
- [ ] 58. Conversation sessions — Session tracking for active chats

### Inbound SMS & Opt-Out
- [ ] 59. Inbound message receipt — Telnyx webhook creates/updates thread and message
- [ ] 60. User identification — Matches sender to correct user via thread → lead → telnyx number
- [ ] 61. Opt-out detection (default words) — "stop", "unsubscribe", "quit", etc. detected
- [ ] 62. Opt-out detection (custom keyword) — User's custom keyword detected
- [ ] 63. DNC auto-add on opt-out — Phone added to DNC list with reason "opt_out"
- [ ] 64. Lead sms_opt_in update — Set to false on opt-out
- [ ] 65. DNC history logging — Opt-out logged with original message text
- [ ] 66. AI drip stops on reply — Active drips completed, scheduled messages cancelled
- [ ] 67. Spam scoring on inbound — spam_score and spam_flags stored
- [ ] 68. Opt-out spam flag — OPT_OUT_REQUEST flag added, score boosted to 50+
- [ ] 69. Receptionist skipped on opt-out — No AI response to opt-out messages
- [ ] 70. Delivery status updates — sent/delivered/failed status tracked
- [ ] 71. Telnyx SMS delivery status — Delivery callbacks update message status

### Voice Calls (Telnyx — needs migration from legacy Twilio code)
- [ ] 72. Inbound call forwarding — Call to Telnyx number forwards to user's personal phone
- [ ] 73. Inbound call webhook — Telnyx call control webhook handles incoming calls
- [ ] 74. Call status tracking — Call status updates received and stored
- [ ] 75. Voicemail recording — Voicemail captured and stored when user doesn't answer
- [ ] 76. Recording status — Recording callback processes correctly
- [ ] 77. Call logging — All calls logged in system for tracking

### Campaigns
- [ ] 78. Create campaign — Name, select leads, compose message
- [ ] 79. Message personalization — {{first}}, {{last}}, {{email}}, {{phone}}, {{state}} replaced
- [ ] 80. Spam check — Flagged messages blocked before send
- [ ] 81. Opt-out keyword required — Campaign blocked if not configured
- [ ] 82. Insufficient credits — 402 error with points needed
- [ ] 83. Campaign execution — Messages sent to all selected leads
- [ ] 84. First-message footer per lead — Opt-out appended only for leads without existing thread
- [ ] 85. Tag application — Tags applied to all leads in campaign
- [ ] 86. Campaign stats — messages_sent, credits_used tracked
- [ ] 87. DNC skip — Leads on DNC list skipped automatically
- [ ] 88. Campaign reuse — Same name reuses existing campaign record
- [ ] 89. Delete campaign — Removal works

### Drip Campaigns (Traditional)
- [ ] 90. Create drip campaign — Name, trigger type (manual/no_reply/tag_added/status_change/lead_created)
- [ ] 91. Drip campaign steps — Add steps with delay, channel, content, template
- [ ] 92. Drip enrollments — Enroll leads, track current step
- [ ] 93. Re-enroll contacts — Re-enrollment works
- [ ] 94. Trigger-based enrollment — Auto-enroll on no_reply, tag_added, status_change, lead_created
- [ ] 95. Drip ready-to-send — Cron picks up enrollments ready for next step

### AI Receptionist
- [ ] 96. Enable/disable — Toggle on/off in receptionist settings
- [ ] 97. System prompt — Custom prompt saved and used
- [ ] 98. Business hours — Start/end time, timezone, days of week
- [ ] 99. After-hours message — Custom message sent outside business hours
- [ ] 100. Respond to new contacts — Toggle works
- [ ] 101. Respond to sold clients — Toggle works
- [ ] 102. Auto-create leads — New inbound number creates lead automatically
- [ ] 103. AI response generation — GPT-4o-mini generates contextual reply
- [ ] 104. Points deduction — 2 points deducted per response
- [ ] 105. Response sent via Telnyx — SMS delivered to lead

### AI Drips
- [ ] 106. Start drip — Creates drip with interval, max messages, expiration
- [ ] 107. Quiet hours (9pm-9am EST) — No messages sent during quiet hours
- [ ] 108. Quiet hours rescheduling — Pending drips rescheduled to 9am EST
- [ ] 109. Message generation — AI generates contextual follow-up
- [ ] 110. Drip stops on client reply — Inbound message completes drip
- [ ] 111. Max messages limit — Drip stops after limit reached
- [ ] 112. Expiration — Drip stops after expiry time
- [ ] 113. Stop drip manually — User can cancel active drip

### AI Features
- [ ] 114. Smart replies — AI-suggested responses display
- [ ] 115. Sentiment analysis — Message sentiment detected
- [ ] 116. Follow-up generation — AI generates follow-up suggestions
- [ ] 117. AI message compose — Generate message from prompt
- [ ] 118. Conversation flows — Create/edit/delete flows
- [ ] 119. Flow step generation — AI generates flow steps
- [ ] 120. Flow creation cost — 15 points deducted per flow creation

### Scheduled Messages
- [ ] 121. Schedule message — Future date/time set, message queued
- [ ] 122. View scheduled — List of pending scheduled messages
- [ ] 123. Cancel scheduled — Remove before send time
- [ ] 124. Cron execution — Messages sent when scheduled_for <= now (every 5 min)
- [ ] 125. Credit check at send time — Insufficient credits handled
- [ ] 126. Quiet hours respect — Scheduled messages respect quiet hours

### Templates
- [ ] 127. Create template — Name, body, category
- [ ] 128. Edit template — Modify existing
- [ ] 129. Delete template — Remove template
- [ ] 130. Use template — Insert into message composer
- [ ] 131. Auto-extract variables — {variable} patterns detected automatically

### DNC Management
- [ ] 132. View DNC list — All entries display with reason/source
- [ ] 133. Add to DNC manually — Single number add
- [ ] 134. Bulk add to DNC — Import multiple numbers
- [ ] 135. Remove from DNC — Single number removal
- [ ] 136. DNC check — API returns correct on_dnc status
- [ ] 137. DNC stats — Total user DNC, global DNC, by reason, recent additions
- [ ] 138. DNC history — Audit trail of adds/removes/blocks

### Opt-Out Keyword Settings
- [ ] 139. Configure keyword in Settings > DNC — Input saves correctly
- [ ] 140. Keyword auto-uppercase — Input converts to uppercase
- [ ] 141. Preview text — Shows "Reply {KEYWORD} to opt out" preview
- [ ] 142. Keyword persists — Reloading page shows saved keyword

### Spam Detection
- [ ] 143. Outbound spam scoring — Messages scored before send, stored in DB
- [ ] 144. Inbound spam scoring — Inbound messages scored, stored in DB
- [ ] 145. Spam word detection — High/medium/low severity words detected
- [ ] 146. Spam check API — Manual check endpoint works
- [ ] 147. Campaign spam block — High-spam messages blocked in campaigns

### Points & Credits
- [ ] 148. View balance — Points display correctly
- [ ] 149. Points deduction on SMS — 1 point per message
- [ ] 150. Points deduction on bulk — 2 points per bulk message
- [ ] 151. Points deduction on AI — 2 points per AI response
- [ ] 152. Points deduction on document upload — 5 points per upload
- [ ] 153. Points deduction on flow creation — 15 points per flow
- [ ] 154. Points deduction on scraper — 50 points per scraper run
- [ ] 155. Insufficient points error — 402 with clear message
- [ ] 156. Point pack purchase — Stripe checkout, credits added
- [ ] 157. Subscription credits — Monthly allocation (3000 basic, 10000 premium)
- [ ] 158. Transaction history — All point changes logged

### Stripe & Payments
- [ ] 159. Subscription checkout — Basic/Premium Stripe checkout works
- [ ] 160. Point pack checkout — One-time purchase works
- [ ] 161. Webhook processing — checkout.session.completed handled
- [ ] 162. Duplicate prevention — Same session_id doesn't double-credit
- [ ] 163. Amount tracking — amount_paid stored correctly in cents
- [ ] 164. Failed payment handling — payment_intent.payment_failed logged

### Analytics
- [ ] 165. Overview dashboard — Key metrics display
- [ ] 166. Campaign performance — Per-campaign stats
- [ ] 167. Message performance — Delivery rates, response rates
- [ ] 168. Messages over time — Time series chart
- [ ] 169. Conversion funnel — Lead stages visualization
- [ ] 170. Best send times — Optimal times analysis
- [ ] 171. SMS analytics — SMS-specific metrics
- [ ] 172. Automation analytics — AI/drip performance

### Email
- [ ] 173. Send email — SMTP or SendGrid delivery
- [ ] 174. Email templates — Welcome, suspended, banned templates render correctly
- [ ] 175. Ban/suspend notification — Emails sent with reason on admin action

### Lead Scraper
- [ ] 176. Configure scraper — URL, selectors, settings
- [ ] 177. Run scraper — Extracts data, stores results
- [ ] 178. Convert to leads — Scraped data becomes leads
- [ ] 179. Deduplication — Hash-based duplicate detection
- [ ] 180. 50 points deducted — Credits charged per run

### Referral System
- [ ] 181. Get referral code — Unique code generated
- [ ] 182. Share code — Code displays for sharing
- [ ] 183. Apply code — New user applies referral code
- [ ] 184. Referral stats — Total/successful referrals display
- [ ] 185. Self-referral prevention — Can't use own code

### Calendar & Appointments
- [ ] 186. Google Calendar OAuth — Connect/disconnect flow
- [ ] 187. View available slots — Calendar availability
- [ ] 188. Book appointment — Slot booking works
- [ ] 189. Create calendar event — Event syncs to Google Calendar
- [ ] 190. Appointment CRUD — Create/read/update/delete appointments via API

### Follow-Ups
- [ ] 191. View follow-ups — List loads with status/priority filters
- [ ] 192. Create follow-up — Manual creation with due date, priority, reminder type
- [ ] 193. Bulk create follow-ups — Multiple follow-ups at once
- [ ] 194. AI follow-up suggestions — AI generates suggested follow-ups
- [ ] 195. Complete/cancel follow-up — Status transitions work

### Admin Panel
- [ ] 196. Admin access — Only admin emails can access
- [ ] 197. User list — All users display with stats
- [ ] 198. Search/filter users — Filter by name, email, plan, status
- [ ] 199. Plan breakdown — Basic/Premium/None counts
- [ ] 200. User stats — Total users, new this week/month, messages, leads
- [ ] 201. Flagged spam stat — Total flagged messages count
- [ ] 202. Spam column — Color-coded avg spam score per user
- [ ] 203. Expandable user row — Click to expand
- [ ] 204. Owned phone numbers — Green/yellow/gray pills show user's Telnyx numbers
- [ ] 205. Recent messages — Last 100 messages with spam scores and flags
- [ ] 206. Suspend user — Duration picker, reason field, email sent
- [ ] 207. Ban user — Permanent, reason field, email sent
- [ ] 208. Unsuspend/Unban — Restore access, clear reason
- [ ] 209. Delete user — Account removal
- [ ] 210. Industry/use case breakdown — Stats display
- [ ] 211. Total spent per user — Dollar amounts from Stripe

### Settings
- [ ] 212. SMS Provider tab — Account status display
- [ ] 213. Phone Numbers tab — Search, purchase, release numbers
- [ ] 214. Spam Protection tab — Enable, block high risk, rate limits
- [ ] 215. Auto-Refill tab — Enable, threshold, amount
- [ ] 216. Integrations tab — Email provider config (SMTP/SendGrid)
- [ ] 217. DNC List tab — Opt-out keyword config + DNC management
- [ ] 218. Account tab — Dark mode, demo mode, quiet hours, delete account
- [ ] 219. Quiet hours config — Separate endpoint saves correctly
- [ ] 220. Privacy/Terms/Compliance/Refund — Policy pages render

### Dashboard Pages
- [ ] 221. Team page — Renders, team member management works
- [ ] 222. Integrations page — Renders, shows connected services
- [ ] 223. Roadmap page — Renders correctly
- [ ] 224. Quoting page — Renders, quote generation works
- [ ] 225. Poverty subsidy calculator — Eligibility check works

### Public Pages
- [ ] 226. Preview page — Marketing/product preview
- [ ] 227. Opt-in page — SMS opt-in form
- [ ] 228. Privacy policy — Renders correctly
- [ ] 229. Terms of service — Renders correctly
- [ ] 230. Compliance page — Renders correctly
- [ ] 231. Refund policy — Renders correctly
- [ ] 232. Contact form — Public form submits successfully

### Cross-Cutting Concerns
- [ ] 233. Mobile responsiveness — All pages render on mobile
- [ ] 234. Dark mode — All pages respect theme
- [ ] 235. Error handling — API errors show user-friendly messages
- [ ] 236. Loading states — Spinners/skeletons display during loads
- [ ] 237. Session persistence — Stays logged in across page navigations
- [ ] 238. Webhook security — Stripe signature verified, Telnyx headers checked
- [ ] 239. RLS (Row Level Security) — Users can only see their own data
- [ ] 240. Encryption at rest — Sensitive tokens (Twilio auth, email API keys) encrypted
- [ ] 241. Cron authentication — CRON_SECRET header validated on cron endpoints
- [ ] 242. User profile CRUD — Read and update profile via API
- [ ] 243. External data ingest — Ingest endpoint handles external data imports
