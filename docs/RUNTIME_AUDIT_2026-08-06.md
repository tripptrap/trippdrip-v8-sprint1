# Runtime audit — raw findings, 2026-08-06

**UNVERIFIED.** These are the 10 sweep agents' raw output. The adversarial
verification pass did not run (spend limit). Tonight three separate findings taken
from production logs turned out to be already fixed — one by a commit that landed
three minutes after its last error — so **check each of these before acting**:

1. Compare the evidence timestamp against `git log` for the file.
2. Grep `docs/SYSTEM_STATE.md` for the error text — it may already be documented.
3. Confirm the behaviour is still broken *now* with a direct query.

Ordered by severity within each area.

## stripe-live-state (7)

### [CRITICAL] No webhook endpoint exists on the live Stripe account — every fulfillment path is dead in live mode

**Where:** `Stripe acct_1SPlV5FmPAhggcMQ (livemode) /v1/webhook_endpoints; app/api/stripe/webhook/route.ts`

**Evidence:** GET /v1/webhook_endpoints on acct_1SPlV5FmPAhggcMQ, livemode=true returns {"object":"list","data":[],"has_more":false,"url":"/v1/webhook_endpoints"} — zero endpoints. STRIPE_WEBHOOK_SECRET IS set in Vercel Production env (name confirmed via `vercel env ls production`), so the code expects one. Vercel runtime logs for the last 7d, grouped by requestPath, show no /api/stripe/webhook entry at all (top paths: /api/user/credits 4525, /api/notifications 3901, /api/cron/process-scheduled 299 …).

**Impact:** Everything the product does after a payment is webhook-driven: checkout.session.completed grants point packs and sets subscription_tier, invoice.paid grants the monthly 3K/10K credit refill, customer.subscription.deleted revokes access. With no live endpoint, the first real customer pays and receives nothing — no tier, no credits, no access — and no renewal ever grants credits again. This is a launch blocker independent of every other Stripe issue.

**Fix:** Create a live-mode webhook endpoint pointing at https://www.hyvewyre.com/api/stripe/webhook, subscribed to checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated and customer.subscription.deleted, then set STRIPE_WEBHOOK_SECRET in Production to that endpoint's live signing secret and re-deploy. Add an assertion to `npm run health` that the live account has ≥1 enabled endpoint whose url matches the production host.

### [CRITICAL] Live catalogue is completely empty (0 products, 0 prices) while every checkout path hardcodes price ids from a different account  _(confirms #81)_

**Where:** `Stripe acct_1SPlV5FmPAhggcMQ /v1/products, /v1/prices; app/api/stripe/create-checkout/route.ts:13-29, change-plan/route.ts:14-15, webhook/route.ts:12-13`

**Evidence:** GET /v1/products → data:[]. GET /v1/prices → data:[]. GET /v1/prices/price_1SQtYHFyk0lZUopFNa0lT81K (the hardcoded Growth fallback) → "Stripe API error: No such price: 'price_1SQtYHFyk0lZUopFNa0lT81K'". `vercel env ls production | grep -i stripe` returns exactly three names — STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY — so NO STRIPE_PRICE_* override exists and all 10 hardcoded fallbacks are in force. Every one of those ids carries the object suffix `Fyk0lZUopF`, i.e. they belong to a different Stripe account than acct_1SPlV5FmPAhggcMQ (whose objects end `FmPAhggcMQ`).

**Impact:** If STRIPE_SECRET_KEY in Production is a live key, every subscribe / upgrade / point-pack purchase fails at checkout creation with "No such price" — nobody can pay at all. If it is still a test key, the app is charging real customers in test mode and collecting nothing. Both readings are launch-blocking; the live-data evidence proves the catalogue side is unbuilt either way.

**Fix:** Create the 2 subscription prices and 8 point-pack prices on acct_1SPlV5FmPAhggcMQ in live mode, set STRIPE_PRICE_* in Vercel Production, and delete the hardcoded fallbacks so a missing env var fails loudly instead of silently pointing at a foreign account.

### [HIGH] The only users row with Stripe ids points at a customer and subscription that do not exist on the live account

**Where:** `public.users id=14acd5ca-377b-4069-9b78-8ba65f70048a (tripped620@gmail.com); app/api/stripe/portal/route.ts:37, change-plan, pause-subscription, delete-account`

**Evidence:** SELECT from public.users: stripe_customer_id='cus_UxyyRuznPrfJUU', stripe_subscription_id='sub_1Ty311Fyk0lZUopFtDW0hl0D', subscription_tier='scale', subscription_status='active'. Against acct_1SPlV5FmPAhggcMQ livemode: GET /v1/customers/cus_UxyyRuznPrfJUU → "No such customer"; GET /v1/subscriptions/sub_1Ty311Fyk0lZUopFtDW0hl0D → "No such subscription". The subscription id also carries the foreign `Fyk0lZUopF` account suffix. Live account totals: 0 customers, 0 subscriptions, 0 payment intents, 0 charges, 0 invoices, 0 refunds, 0 disputes, 0 checkout sessions, balance available $0.00.

**Impact:** Production carries a live-looking billing identity that resolves to nothing. Every Stripe route keyed on it — portal, change-plan, pause/resume, delete-account cancellation — throws "No such customer/subscription" against the live key, and the routes that swallow errors (#160, #157) will report success while doing nothing. It also poisons any future reconciliation: this row reads as a paying Scale customer that Stripe has never heard of.

**Fix:** Null out the stale sandbox ids on that row before launch (or point the whole environment at the sandbox deliberately), and have `npm run health` assert that every non-null users.stripe_customer_id / stripe_subscription_id resolves on the configured account.

### [HIGH] 188,000 production credits were granted against test-mode checkout sessions; the live account has never taken a cent

**Where:** `public.points_transactions (7 rows, action_type='purchase'); Stripe acct_1SPlV5FmPAhggcMQ`

**Evidence:** SELECT action_type, count(*), sum(points_amount), sum(amount_paid), count(stripe_session_id) FROM points_transactions GROUP BY 1 → purchase: n=7, pts=188000, paid=0, with_session=7. Every one of those seven stripe_session_id values begins `cs_test_` (e.g. cs_test_a111e8YdwnbGWRiP2GlLKpkntFQXEZMrLZPUOVANXeavv9ww8EAcc9ZJ5s, 4000 pts, 2025-11-08; cs_test_a1Cbl0UDthlm08x57iN43zGt6GNqeDDYWxRBKZxjaawlsdQHr6MDiZnySz, 60000 pts). Live Stripe has 0 checkout sessions and $0 lifetime volume. Meanwhile public.users holds 305,731 credits across 7 accounts (209,400 on trippebrowning@gmail.com alone) and 5 of 7 rows sit on a paid tier with stripe_customer_id NULL. Also: the 3 action_type='subscription' rows sum to 9,000 points with sum(amount_paid)=3000 recorded against no Stripe object at all.

**Impact:** The production credit ledger cannot be reconciled against Stripe — it records ~$500+ of point packs as purchased when the live account shows zero revenue, and one row claims amount_paid=3000 with no session id. Any launch-day revenue report, refund decision or fraud check built on points_transactions starts from corrupted data, and the 305,731 outstanding credits are real SMS/AI spend the platform has not been paid for.

**Fix:** Purge or explicitly flag the cs_test_* purchase rows and the unbacked subscription grants before launch, zero the seeded balances on the non-customer accounts, and add a health assertion that every points_transactions row with action_type in ('purchase','subscription') has a stripe_session_id that resolves on the live account.

### [HIGH] No billing-portal configuration exists on live, so /api/stripe/portal cannot succeed for any customer

**Where:** `Stripe acct_1SPlV5FmPAhggcMQ /v1/billing_portal/configurations; app/api/stripe/portal/route.ts:37`

**Evidence:** GET /v1/billing_portal/configurations, livemode=true → {"object":"list","data":[],"has_more":false}. The route calls stripe.billingPortal.sessions.create({ customer, return_url }) with no `configuration` argument; in live mode Stripe requires a saved portal configuration and returns an error when none exists.

**Impact:** Self-service billing is the only cancel/update-card path the product offers. On launch day the Settings → Manage Billing button 500s for every customer (the route surfaces error.message straight to the UI), forcing cancellations through support — and through the chargeback that follows when support is slow. It also means issues #168 and #169 (portal cancellation doesn't revoke access / release numbers) are currently untestable because the portal never opens.

**Fix:** Save the customer portal settings in the live Dashboard (or create a portal configuration via API) before launch, then re-test the #168/#169 cancellation paths against it.

### [MEDIUM] Live card statements will read TRIPPDRIP, not HyveWyre

**Where:** `Stripe acct_1SPlV5FmPAhggcMQ settings.payments.statement_descriptor / settings.card_payments.statement_descriptor_prefix`

**Evidence:** Account object: settings.payments.statement_descriptor = "TRIPPDRIP", settings.card_payments.statement_descriptor_prefix = "TRIPP", while business_profile.name = "Hyvewyre" and dashboard.display_name = "HyveWyre". (Note the account has 0 products, so issue #82's Basic/Premium product names exist only on the sandbox — this descriptor is the live customer-visible naming problem.)

**Impact:** Every $30/$98 charge and every point-pack charge lands on the cardholder's statement under a brand they never signed up for. Unrecognized descriptors are the single largest driver of "I don't recognize this charge" disputes, and this account has zero dispute history to absorb them — early chargebacks on a new account risk Stripe review.

**Fix:** Set the live statement descriptor and card prefix to HYVEWYRE in the Stripe Dashboard before the first real charge.

### [LOW] Auto-refill has never charged anything on live, and no user row has it enabled  _(confirms #159)_

**Where:** `public.users.auto_topup; app/api/cron/auto-buy/route.ts; Stripe /v1/payment_intents`

**Evidence:** All 7 users rows read auto_topup=false with byte-identical defaults auto_topup_threshold=100, auto_topup_amount=500 — no row has ever deviated. Live Stripe: GET /v1/payment_intents → data:[] (zero, lifetime). The auto-buy cron nonetheless executed 24 times in the last 7 days per Vercel runtime-log counts for /api/cron/auto-buy.

**Impact:** Corroborates #159 from the data side: the settings write never reaches the column the cron reads, so the cron is a permanent no-op and the "never run out of credits" promise has never once fired. Evidence is circumstantial — I cannot prove from data alone that a user tried to enable it — but the uniform defaults across every account are consistent with no write ever landing.

**Fix:** Fix the service-role write in #159, then verify by toggling auto-refill on a test account and confirming users.auto_topup flips to true.

**Coverage notes:** DIRECT ANSWERS FOR docs/STRIPE_LIVE_CATALOGUE.md (all from acct_1SPlV5FmPAhggcMQ, livemode=true).

1) ACCOUNT IS ACTIVATED — definitively. The MCP exposes no bare GetAccount, but GET /v1/accounts/{account} with the account's own id works. charges_enabled=true, payouts_enabled=true, details_submitted=true, requirements.currently_due=[], requirements.past_due=[], requirements.errors=[], requirements.disabled_reason=null, individual.verification.status="verified", tos_acceptance.date=1762471943. Type standard, country US, business_type individual, default_currency usd, created 1762267583. One external bank account attached (TRUIST BANK, status "new", default_for_currency true), payout schedule daily with 2-day delay. Capabilities active: card_payments, us_bank_account_ach_payments, link, cashapp, klarna, affirm, afterpay_clearpay, amazon_pay, acss_debit, bancontact, eps, transfers. Only cartes_bancaires_payments is "pending". requirements.eventually_due=["business_profile.url"] (business_profile.url is currently "hyvewyre.com" with no scheme) — not blocking today, but it will acquire a deadline; worth setting to https://www.hyvewyre.com. Nothing about account activation blocks launch. Balance available and pending are both $0.00 USD.

2) PRODUCTS AND PRICES ON LIVE: zero of each. The catalogue doc's "zero" is correct. Confirmed by empty /v1/products and /v1/prices lists and by a direct 404 on the hardcoded Growth price id.

3) MONEY MOVED ON LIVE: none, ever. customers=0, subscriptions (status=all)=0, payment_intents=0, charges=0, invoices=0, checkout sessions=0, refunds=0, disputes=0, balance $0.00. Consequently the #162 fingerprint (duplicate customers sharing an email) has no instances — there are no customers to duplicate; that prediction remains untested rather than disproven. Likewise there are zero past_due/unpaid subscriptions and zero subscriptions-without-a-users-row, because there are zero subscriptions. The cross-reference failed in the other direction instead: the DB holds a customer and subscription id that Stripe does not (finding 3).

4) WEBHOOK ENDPOINT: none configured on live (finding 1). Also no billing-portal configuration (finding 5).

CROSS-REFERENCE AGAINST public.users: 7 rows, 7 auth.users, 1 with stripe_customer_id, 1 with stripe_subscription_id, 5 on a paid tier (growth/scale), 305,731 credits outstanding. Other Stripe-adjacent tables are empty: payments=0, transactions=0, point_pack_purchases=0, user_telnyx_numbers with stripe_subscription_id=0 (of 3 numbers total) — so #169's "cancel a phone-number subscription" path has no live rows to match, and #166/#154's number-subscription flow has never produced a Stripe object.

WHAT I COULD NOT REACH: I could not determine whether STRIPE_SECRET_KEY in Vercel Production is a live or test key without reading its value, which is forbidden. I confirmed only the env var NAMES present in Production (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) and that no STRIPE_PRICE_* variable exists there. I attempted to infer the mode from the publishable key rendered on the public site (grep -c for pk_live / pk_test on /preview and /login, counts only, no values printed) — both zero, the key is not inlined on those pages, so the mode is still unresolved. Determining it requires someone looking at the Dashboard key prefix.

CLEAN / NOT A FINDING: account activation and verification (fully done), payout wiring (bank attached, payouts enabled), and dispute/refund history (none). Vercel runtime errors for the last 7 days contain no /api/stripe/* error cluster whatsoever, which is consistent with the finding that nobody has exercised the Stripe routes in production — absence of errors here is absence of traffic, not evidence of health.

## supabase-security-advisors (6)

### [HIGH] user_telnyx_numbers has RLS on with a SELECT-only policy — /api/telnyx/release-number deletes the row with the session client, so it silently deletes nothing after the number is already destroyed at Telnyx

**Where:** `/Applications/hyvewyre/app/api/telnyx/release-number/route.ts:80-88 (DELETE via `supabase` = await createClient()); DB object public.user_telnyx_numbers`

**Evidence:** Live pg_policy dump: user_telnyx_numbers has exactly ONE policy — {polname: "Users can view their own numbers", polcmd: "r" (SELECT), roles: PUBLIC, using: (auth.uid() = user_id)}. There is no INSERT, UPDATE or DELETE policy, yet has_table_privilege('authenticated','user_telnyx_numbers','DELETE') = true and the same for anon. Corroborating live runtime error from Vercel (route /api/number-pool/purchase-with-credits, dpl_DDU47AYQPdJMYXNyhyrWfNwsSxr5, 2026-07-31T04:27:52Z): "Error adding number: { code: '42501', message: 'new row violates row-level security policy for table \"user_telnyx_numbers\"' }" — proof that this table's RLS really does reject session-client writes in production. (That INSERT site has since been moved to createServiceRoleClient(); release-number:80 has not.)

**Impact:** Postgres treats a missing DELETE policy as a row filter, not an error — the delete matches zero rows and supabase-js returns { error: null }, so `dbError` is null and the route answers 200. By that point the number has already been hard-deleted from Telnyx (line 58-68) and releasePoolNumber() has returned it to the assignable pool. The user_telnyx_numbers row survives forever: the number keeps showing on /phone-numbers, resolveFromNumber() and the process-scheduled cron can still select it as a from-number, and every send from it fails at the carrier. The same row can also be handed to a second tenant from the pool while the first tenant still owns it in the DB.

**Fix:** Switch the delete at release-number/route.ts:80 to createServiceRoleClient() (ownership is already verified at line 24-30), and check `count` not just `error` — a 0-row delete must not report success. Separately, add explicit INSERT/UPDATE/DELETE policies to user_telnyx_numbers or revoke those grants from anon/authenticated so the failure is loud rather than silent.

### [HIGH] 41 (table, command) pairs grant DML to authenticated/anon with no matching RLS policy — every session-client write to them fails, INSERTs loudly with 42501 and UPDATE/DELETEs silently as zero rows

**Where:** `public schema, 20 tables: contact_form_submissions, dnc_history, lead_activities, notifications, number_pool, payments, point_pack_purchases, point_packs, receptionist_logs, referral_codes, referral_rewards, referrals, scraper_runs, sending_history, service_emails, sms_messages, sms_responses, transactions, user_telnyx_numbers (+ points_transactions, see fix)`

**Evidence:** Query over pg_policy x has_table_privilege('authenticated', …) returned 41 rows where the grant exists and no policy covers the command. Missing INSERT policy: contact_form_submissions, notifications, number_pool, payments, point_packs, referral_rewards, referrals, user_telnyx_numbers. Missing UPDATE policy: contact_form_submissions, dnc_history, lead_activities, number_pool, payments, point_pack_purchases, point_packs, receptionist_logs, referral_rewards, referrals, scraper_runs, sending_history, service_emails, transactions, user_telnyx_numbers. Missing DELETE policy: all 19 above plus referral_codes, sms_messages, sms_responses. anon_granted is true for every one of the 41. Live confirmation that this is not theoretical: the 42501 "new row violates row-level security policy for table user_telnyx_numbers" above.

**Impact:** This is the RLS half of the 42501 bug class already known from column grants on public.users. Any route that writes one of these tables with `await createClient()` instead of createServiceRoleClient() fails; on INSERT it at least raises 42501, but on UPDATE and DELETE RLS is a filter, so supabase-js returns { error: null } and the caller reports success while nothing changed. Today's audit found one live instance (release-number), but the gap is permanent and any new code touching notifications, payments, referrals, number_pool or the DNC history will hit it the same way. contact_form_submissions (0 rows), payments (0), referrals (0), referral_rewards (0), referral_codes (0), transactions (0), sending_history (0), service_emails (0) are all empty, so none of these write paths has ever been exercised end to end in production.

**Fix:** Two-part: (a) revoke INSERT/UPDATE/DELETE from anon on all 58 tables (already tracked as #149) so anon can never be the actor; (b) for each of the 41 pairs decide explicitly — either add the matching `FOR <cmd> TO authenticated USING/WITH CHECK (auth.uid() = user_id)` policy, or revoke the grant from authenticated too so any code path that needs it is forced through the service-role client and fails loudly at review time rather than silently at runtime.

### [HIGH] CONFIRMED: anon holds INSERT+UPDATE+DELETE on exactly 58 of 63 public tables, and pg_graphql makes 59 of them discoverable pre-auth through the GraphQL endpoint  _(confirms #149)_

**Where:** `public schema; advisor lints pg_graphql_anon_table_exposed (59) and pg_graphql_authenticated_table_exposed (60)`

**Evidence:** Live grant census over 63 public tables: anon SELECT=59, INSERT=58, UPDATE=58, DELETE=58, and all-three-of-IUD=58 — an exact match for #149's headline. The single table with anon SELECT but no write grants is points_transactions. Advisor adds the discovery angle #149 does not mention: `pg_graphql_anon_table_exposed` fires 59 times, e.g. "table `public.leads` is visible in the GraphQL schema because the `anon` role can `SELECT` it", covering leads, clients, messages, threads, dnc_list, dnc_global, payments, points_transactions, user_telnyx_numbers, number_pool and 49 more. `pg_graphql_authenticated_table_exposed` fires 60 times — the same set plus public.users.

**Impact:** Upgrades #149 from a grant-list to a confirmed shape: with the publishable anon key alone, the /graphql/v1 endpoint introspects the full 59-table schema including every column name of leads, messages, dnc_list and user_telnyx_numbers. RLS is genuinely the only thing withholding rows, and this audit found four tables (api_keys, cron_runs, number_pool_assignments, rate_limits) whose entire protection is an empty policy set. Every table name, column name and relationship in the product is public information today.

**Fix:** REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon, and revoke SELECT from anon on everything except the genuinely public read (point_packs, is_active=true). Set ALTER DEFAULT PRIVILEGES so new tables do not re-acquire the grants. Verify afterwards by re-running get_advisors and expecting the anon lint count to drop to 1.

### [MEDIUM] rls_enabled_no_policy on four tables, and cron_runs additionally hands anon full SELECT/INSERT/UPDATE/DELETE grants

**Where:** `public.api_keys, public.cron_runs, public.number_pool_assignments, public.rate_limits`

**Evidence:** Advisor lint `rls_enabled_no_policy` (INFO, EXTERNAL), 4 occurrences: "Table `public.api_keys` has RLS enabled, but no policies exist" and identically for cron_runs, number_pool_assignments, rate_limits. Live privilege check: cron_runs has anon SELECT=true, INSERT=true, UPDATE=true, DELETE=true; the other three have all four false. All four tables hold real data — cron_runs 1858 rows (last ran_at 2026-08-06 19:01:33Z), api_keys 2 rows, rate_limits 3 rows, number_pool_assignments 1 row.

**Impact:** RLS with zero policies denies everything to anon and authenticated, so there is no data leak today — but cron_runs is the only table on the platform where anon holds all four DML grants with nothing but that empty-policy default standing between the public anon key and the cron-freshness ledger that `npm run health` and the overdue-cron alerting both read. One `DROP POLICY`-free migration that flips relrowsecurity off, or one policy added carelessly, turns it into an anonymous write target. It is also a silent-failure trap in the other direction: any future session-client read of api_keys or rate_limits returns zero rows with no error (both are correctly service-role-only today).

**Fix:** REVOKE ALL ON public.cron_runs FROM anon, authenticated — it is a service-role-only operational table and needs no grant at all. Do the same for the other three, and leave RLS enabled so the deny-by-default remains belt-and-braces.

### [MEDIUM] Supabase Auth leaked-password protection (HaveIBeenPwned check) is disabled on a paid production tenant

**Where:** `Supabase Auth config, project ljibsszhcvhwnoegweat`

**Evidence:** Advisor lint `auth_leaked_password_protection` (WARN, EXTERNAL, categories: [SECURITY]), 1 occurrence: "Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security."

**Impact:** Password-based signup and password changes accept credentials known to be in public breach corpora. Each account here holds a tenant's full lead and client PII plus the ability to send SMS on the platform's Telnyx account and to trigger Stripe point-pack purchases, so a credential-stuffed account is both a data-breach and a spend event. This is the only auth-category advisory firing and it is a config toggle, not code.

**Fix:** Enable Leaked Password Protection in Supabase Dashboard → Authentication → Policies (or `password_hibp_enabled` in auth config). No code change, no migration.

### [MEDIUM] CONFIRMED: exactly 24 SECURITY DEFINER functions have a mutable search_path — advisor count is 49 because 25 more SECURITY INVOKER functions are flagged by the same lint  _(confirms #151)_

**Where:** `public schema functions; advisor lint function_search_path_mutable`

**Evidence:** Advisor: 49 occurrences of `function_search_path_mutable` (WARN, EXTERNAL). Live pg_proc query splits them exactly: prosecdef=true, n=24 — add_to_dnc, apply_referral_code, bulk_add_to_dnc, check_dnc, execute_auto_tagging_rule, generate_referral_code, get_ai_drips_ready_to_send, get_campaigns_ready_for_batch, get_dnc_stats, get_messages_ready_to_send, get_or_create_referral_code, get_referral_stats, get_service_email_stats, get_tag_usage_stats, get_user_current_month_usage, get_user_settings, get_user_twilio_credentials, handle_new_user, has_active_referral_reward, initialize_user_preferences, is_within_quiet_hours, remove_from_dnc, schedule_message, stop_ai_drip_on_reply. prosecdef=false, n=25 (trigger and helper functions incl. update_updated_at_column, normalize_phone, log_lead_change, is_within_business_hours).

**Impact:** #151's count of 24 is exactly right for the SECURITY DEFINER set, which is the part that actually escalates. The list includes the entire compliance and billing surface — add_to_dnc, check_dnc, remove_from_dnc, bulk_add_to_dnc, schedule_message, get_messages_ready_to_send, handle_new_user — all running as owner with a caller-controllable search_path. The practical note for whoever fixes it: a change scoped to "the 24" will leave 25 advisories still firing and the advisor page still red, which is how this kind of item gets re-opened. Fix all 49 in one migration.

**Fix:** ALTER FUNCTION public.<name>(<args>) SET search_path = public, pg_temp; for all 49, generated from pg_proc rather than hand-listed so overloads are not missed. Prioritise the 24 SECURITY DEFINER ones.

**Coverage notes:** Read 100% of the 143,028-char advisor output (parsed as JSON, 173 lints). Full census by lint name / level: pg_graphql_authenticated_table_exposed 60 WARN, pg_graphql_anon_table_exposed 59 WARN, function_search_path_mutable 49 WARN, rls_enabled_no_policy 4 INFO, auth_leaked_password_protection 1 WARN. Total 173, all EXTERNAL-facing, all SECURITY category. There are no ERROR-level security advisories.

Clean / verified absent, so nobody needs to re-check these: no `security_definer_view` advisory and no views or materialized views exist in the public schema at all (pg_class relkind v/m returns zero rows), so there is no SECURITY DEFINER view exposure. No `rls_disabled_in_public` — every one of the 63 public tables has relrowsecurity=true. No `extension_in_public` — pg_stat_statements, pgcrypto and uuid-ossp all live in `extensions`, pg_graphql in `graphql`, supabase_vault in `vault`. No `auth_users_exposed` — auth.users is not reachable through any public view, and public.users is exposed to `authenticated` only, never to anon. No policy anywhere uses a permanently-true qual for a real role: the only USING(true) is scoped `TO service_role` on porting_orders, and the only broad public read is point_packs USING (is_active = true), which is the pricing table and intentional. dnc_global is locked with USING(false).

One thing to be aware of when reading the pg_policy dump: essentially every policy on this database is written `TO PUBLIC` rather than `TO authenticated`. That is not itself a hole — auth.uid() is NULL for anon so `auth.uid() = user_id` evaluates NULL and denies — but it means the role column tells you nothing, and the only real gate is the qual. It is why the missing-policy analysis in findings 1 and 2 had to be done per-command rather than per-table.

Adjacent fact worth recording but not filed as its own finding: points_transactions is the one table where anon/authenticated hold SELECT but no INSERT/UPDATE/DELETE grant, and its only policy is SELECT. Every credit-ledger write therefore must go through the add_credits / deduct_credits SECURITY DEFINER RPCs; a hand-rolled `.from('points_transactions').insert()` with the session client would fail with 42501 "permission denied", not an RLS violation. Current code does route through the RPCs.

Could not reach: Supabase postgres logs — mcp get_logs returned FetchException "Failed to get project's logs" on the postgres service, so I could not count 42501 occurrences at the database tier. The runtime evidence in findings 1 and 2 comes from Vercel get_runtime_errors (7d window) instead, which is why finding 1 cites a single dated occurrence rather than a frequency.

## supabase-performance-advisors (6)

### [MEDIUM] Every RLS policy calls auth.uid() per row — measured 22x slowdown on this exact instance (1,508 ms vs 67 ms)

**Where:** `182 policies across 56 public tables; hot ones: leads (8), messages (7), threads (4), scheduled_messages (4), clients (4), dnc_list (4), points_transactions (1)`

**Evidence:** get_advisors(performance) returns 182 `auth_rls_initplan` WARNs. I measured the real cost on this instance with a representative Supabase JWT claims payload set:

  EXPLAIN ANALYZE ... WHERE (auth.uid())::text = (g)::text  over 200,000 rows
  -> "Rows Removed by Filter: 200000 ... Execution Time: 1508.395 ms"

  same query with the initplan form ((select auth.uid())):
  -> "InitPlan 1 -> Result (actual time=0.054..0.056 rows=1)" ... "Execution Time: 67.492 ms"

1508 ms / 200k = 7.5 microseconds of jsonb-claims parsing per row, vs one evaluation total. Expanded qual visible in the plan: `COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''), (NULLIF(current_setting('request.jwt.claims',true),''))::jsonb ->> 'sub')::uuid`. The ::jsonb cast of the full claims blob is what costs the 7.5 us, and it runs once per row scanned.

**Impact:** Invisible today (leads=209 rows, messages=118), which is why it has never shown up. It bites the first customer who imports a real list. /leads listing or filtering 100k leads pays ~0.75 s of pure RLS overhead per request; a bulk tag/status UPDATE across the same set pays it again on the scan. Analytics counts over messages, which have no selective filter to help them, pay it over the whole table. This is the single change with the highest ratio of one-line fix to future latency.

**Fix:** Rewrite every policy qual to wrap the call: `(select auth.uid()) = user_id` instead of `auth.uid() = user_id`. Postgres then hoists it to an InitPlan and evaluates once per query. Do the hot tables first (leads, messages, threads, clients, scheduled_messages, dnc_list, points_transactions), then the rest. Purely mechanical, no semantic change — the same rows match.

### [MEDIUM] leads, messages and campaigns each carry two identical, fully duplicated RLS policy sets — doubling the per-row cost on exactly the rows being filtered out

**Where:** `public.leads, public.messages, public.campaigns (pg_policies); 91 `multiple_permissive_policies` advisories total`

**Evidence:** pg_policies shows two policies per command with byte-identical quals — one migration's naming, then another's:
  leads/SELECT: "Users can view own leads" and "Users can view their own leads", both qual `(auth.uid() = user_id)`
  leads/INSERT, UPDATE, DELETE: same duplication
  messages/SELECT, INSERT, DELETE: same
  campaigns/SELECT, INSERT, UPDATE, DELETE: same
All are PERMISSIVE and all target role `{public}`, so Postgres ORs them: `(auth.uid()=user_id) OR (auth.uid()=user_id)`. OR short-circuits on match, so owned rows cost 1x — but every row belonging to a *different* tenant is evaluated twice before being rejected.

**Impact:** Compounds finding #1 in the worst place: multi-tenancy. The doubling lands on rows that get discarded, which is the majority of the table once there is more than one real customer. At 10 tenants x 100k leads, a query that cannot use idx_leads_user_id scans 1M rows and pays 2 x 7.5 us on ~900k of them — about 13 s. Also makes the policy surface twice as large to reason about, which is how a fix to one copy silently leaves the other in place.

**Fix:** Drop one copy of each duplicated pair (keep the "their own" naming, it is the more consistent set) at the same time as the (select auth.uid()) rewrite. Verify with: SELECT tablename, cmd, count(*) FROM pg_policies WHERE schemaname='public' AND permissive='PERMISSIVE' GROUP BY 1,2 HAVING count(*)>1;

### [MEDIUM] Deleting a lead full-table-scans the credit ledger — points_transactions.lead_id, .message_id and .campaign_id are unindexed ON DELETE SET NULL FKs, and deduct_credits writes one ledger row per SMS

**Where:** `public.points_transactions (lead_id, message_id, campaign_id), public.transactions (same three), public.receptionist_logs.lead_id, public.scraped_data.converted_to_lead_id`

**Evidence:** Advisor lists all of these under `unindexed_foreign_keys`; I confirmed against pg_constraint that all six have confdeltype='n' (SET NULL) and no leading index. SET NULL means Postgres must locate the child rows, so with no index it seq-scans the whole child table once per deleted parent row.

pg_stat_statements over the last 12d 16h already shows the cost:
  DELETE FROM "public"."leads" WHERE "id" = $1        -> 2 calls, mean 84.62 ms, max 120.0 ms
  DELETE FROM "public"."leads" WHERE "phone" = ANY($1) -> 2 calls, mean 83.76 ms, max 167.5 ms
That is 84 ms to delete one row from a 209-row table whose children currently hold 26 and 22 rows.

And points_transactions is the fastest-growing table in the product — public.deduct_credits() body: `INSERT INTO public.points_transactions (user_id, action_type, points_amount, description, created_at) VALUES (..., 'spend', -amount, ...)`, i.e. one row per SMS, per bulk message, per AI reply.

**Impact:** Lead deletion is O(rows in points_transactions) per lead. The app exposes bulk delete (`phone = ANY($1)`), so deleting 500 leads after a bad import means 500 full scans of the ledger. At 500k ledger rows that is minutes of a held connection and a timed-out Vercel function; the DELETE is not idempotent from the client's perspective, so a retry re-runs the whole thing. Message and campaign deletion hit the same two unindexed columns.

**Fix:** CREATE INDEX CONCURRENTLY on points_transactions(lead_id), (message_id), (campaign_id) and the same three on transactions, plus receptionist_logs(lead_id) and scraped_data(converted_to_lead_id). Six of these are on tables under 30 rows today so the index build is instant — do it before the ledger grows, not after.

### [LOW] messages has two byte-identical indexes on thread_id; the inbound-SMS write path maintains both

**Where:** `public.messages — idx_messages_thread and idx_messages_thread_id`

**Evidence:** Only `duplicate_index` WARN in the whole advisor run: "Table public.messages has identical indexes {idx_messages_thread,idx_messages_thread_id}. Drop all except one of them". pg_indexes confirms both are `USING btree (thread_id)` with no predicate. pg_stat_user_indexes: idx_messages_thread has 82 scans, idx_messages_thread_id has 0 — the planner has never once chosen the second.

**Impact:** Every INSERT into messages (every inbound webhook, every outbound send, every drip/campaign message) does two identical btree inserts instead of one, and VACUUM maintains both. Small per-row, but it is on the hottest write path in the product and the fix has literally zero downside.

**Fix:** DROP INDEX CONCURRENTLY public.idx_messages_thread_id; (drop the never-used one, keep idx_messages_thread).

### [LOW] leads carries 20 indexes of which 9 have never been scanned — 528 kB of index against 104 kB of heap, all maintained on every CSV import row

**Where:** `public.leads (and messages: 16 indexes, 3 unused; clients: 8 indexes, 4 unused; scheduled_messages: 9 indexes, 3 unused)`

**Evidence:** 79 `unused_index` INFO advisories. pg_stat_user_indexes over 12d 16h: on leads, idx_scan=0 for idx_leads_client_id, idx_leads_status, idx_leads_temperature, idx_leads_email, idx_leads_appointment_at, idx_leads_last_interaction, idx_leads_qualification_score, idx_leads_converted, idx_leads_normalized_phone. Meanwhile leads_pkey has 47,682 scans and idx_leads_user_id only 74. Sizes: heap 104 kB, indexes 528 kB — 5x more index than data.

**Impact:** CSV/Excel lead import is the product's bulk-write path and it pays 20 index inserts per row. A 10k-lead import writes 200k index entries, ~half of them into structures no query has ever used. Also inflates WAL and backup size.

**Fix:** Do not mass-drop — several (idx_leads_normalized_phone, idx_leads_status, idx_leads_email) are plausibly there for code paths that have not run yet in this 12-day window. Re-check pg_stat_user_indexes after a month of real traffic, then drop what is still at idx_scan=0. The clear-cut one to drop now is the duplicate above.

### [LOW] points_transactions has a redundant unique index — unique_stripe_session_idx is fully implied by points_transactions_stripe_session_id_key

**Where:** `public.points_transactions`

**Evidence:** pg_indexes:
  points_transactions_stripe_session_id_key UNIQUE (stripe_session_id) WHERE stripe_session_id IS NOT NULL
  unique_stripe_session_idx                 UNIQUE (user_id, stripe_session_id) WHERE stripe_session_id IS NOT NULL
A unique constraint on stripe_session_id alone already guarantees uniqueness of (user_id, stripe_session_id); the composite can never reject a row the single-column one accepts. Not caught by the duplicate_index advisor because the column lists differ.

**Impact:** Two unique-index probes and two btree inserts on every ledger write (once per SMS) for one enforced invariant. Second-order hazard: app/api/stripe/webhook/route.ts:23 relies on catching PG_UNIQUE_VIOLATION '23505' from a plain INSERT, so either index can be the one that fires — meaning if anyone later switches that path to onConflict('user_id,stripe_session_id'), the single-column index would still throw 23505 and the ON CONFLICT clause would not absorb it.

**Fix:** DROP INDEX CONCURRENTLY public.unique_stripe_session_idx; the single-column unique keeps the webhook idempotency guarantee intact.

**Coverage notes:** Method: get_advisors(performance) returned 371 lints — auth_rls_initplan 182 (WARN), multiple_permissive_policies 91 (WARN), unused_index 79 (INFO), unindexed_foreign_keys 17 (INFO), duplicate_index 1 (WARN), auth_db_connections_absolute 1 (INFO). I read all 371 by parsing the saved JSON, then verified each candidate against the live DB (pg_indexes, pg_policies, pg_constraint, pg_stat_user_tables/indexes, pg_stat_statements) rather than reporting the advisor at face value. All SQL was SELECT/EXPLAIN only.

Checked and deliberately NOT reported:
- Unindexed FKs on drip_campaign_enrollments.user_id, drip_campaign_steps.template_id, lead_activities.sms_message_id/sms_response_id, lead_flows.thread_id, point_pack_purchases.point_pack_id, referral_rewards.referral_id, scheduled_messages.drip_step_id, sms_responses.original_message_id. All on tables with 0-8 rows and none on a send path. lead_flows.thread_id is the only one worth watching (it is ON DELETE SET NULL from threads).
- The 91 multiple_permissive_policies advisories are inflated by Supabase counting each of 6 roles separately; the real distinct problem is 14 (tablename, cmd) pairs, of which 11 are the leads/messages/campaigns duplicates I reported. The other 3 are intentional (number_pool SELECT: own-number + unassigned-pool; porting_orders ALL: service_role + owner; user_settings INSERT).
- `SELECT name FROM pg_timezone_names` is the single most expensive statement on the instance — 83 calls, 38,297 ms total, mean 461 ms, max 740 ms. I traced it and it is NOT the app: grep across /Applications/hyvewyre for "timezone_names" returns nothing. It is Supabase Studio's / the platform's timezone picker. Not actionable here, but worth knowing if someone sees it in a dashboard.
- auth_db_connections_absolute (INFO): Auth server capped at 10 connections with an absolute rather than percentage allocation. Irrelevant at 7 users; only matters if the instance is ever resized.
- leads currently does 23,883 seq scans with 4,979,766 tuples read (avg 208.5 rows/scan = full scans) despite idx_leads_user_id existing. That is correct planner behaviour for a 209-row / 104 kB table, not a bug — I checked before assuming otherwise. It matters only as the reason findings #1 and #2 are invisible today.

Cross-checked all six findings against the 53 open issues in open-issues.txt — none overlap. #149 (anon write grants) and #151 (SECURITY DEFINER search_path) touch policies and functions but are security findings about different objects.

Could not reach: no historical query data before 2026-07-25 02:20 UTC (pg_stat_statements_info.stats_reset), so the 12d 16h window is all the runtime evidence available.

## vercel-errors (5)

### [HIGH] Cron watchdog fired 624 escalated "job has stopped" pages for jobs that were running fine — the confirmation read discards its error and treats no-data as "never ran"

**Where:** `lib/cronAuth.ts:118 (unchecked error), lib/cronAuth.ts:131 (null-means-never-ran)`

**Evidence:** get_runtime_errors(7d): 624 occurrences on /api/cron/process-scheduled of "[cron_overdue:auto-buy,send-appointment-reminders] ... auto-buy: has never run; send-appointment-reminders: has never run", first=2026-08-03T21:45:30Z last=2026-08-06T03:10:47Z, plus 31 more from /api/cron/auto-buy, 29 from /api/cron/heartbeat, 12 external-heartbeat variants and 2 from process-ai-drips. Live cron_runs contradicts every one of them: auto-buy has 70 runs (first 2026-08-03T22:01:48Z, last 2026-08-06T19:00:35Z) and send-appointment-reminders has 35 runs (last 2026-08-06T18:00:28Z). The app itself logged the contradiction 30 times: "find_overdue_crons disagrees with cron_runs for send-appointment-reminders: RPC said last_ran_at=null, table says 2026-08-04T04:00:56.75459+00:00 (84m ago, grace 200m). Alert suppressed."

**Impact:** 624 escalated pages on the channel reserved for real outages, over 2.5 days, all false. This is the alert-fatigue failure #117 was built to prevent: the next genuine "drips have stopped" page is indistinguishable from the noise and will be ignored. The suppression logic added in bebbef9 only caught 30 of the 624 — the other 594 escalated.

**Fix:** lib/cronAuth.ts:118 destructures only `{ data: actualRuns }` and drops `error`. When that read fails for any reason, actualRuns is null, lastSeen is empty, and line 131 (`if (!seen) return true; // table agrees it has never run`) converts a failed read into a positive assertion that the job never ran. Check `error` and, on a read failure, return without alerting — an unverified suspicion must not escalate. The watchdog is exhibiting the exact supabase-js silent-failure class CLAUDE.md warns about, inside the code meant to detect it.

### [HIGH] Alert suppression grace is wider than the RPC's overdue grace for both low-frequency crons, creating a window where a genuinely dead job is actively silenced

**Where:** `lib/cronAuth.ts:137 vs supabase/migrations/cron_run_heartbeat.sql:79-84`

**Evidence:** supabase/migrations/cron_run_heartbeat.sql:79-84 (identical to the live pg_get_functiondef) sets grace at 90 min for auto-buy and 180 min for send-appointment-reminders. lib/cronAuth.ts:137 independently recomputes it as `o.expected_minutes * 1.5 + 20`, giving 60*1.5+20=110 and 120*1.5+20=200. Production logs confirm the code's numbers are the ones in force: "auto-buy ... (24m ago, grace 110m)" and "send-appointment-reminders ... (84m ago, grace 200m)".

**Impact:** auto-buy can be dead for 90–110 minutes and send-appointment-reminders for 180–200 minutes while the RPC correctly flags them overdue and the JS suppresses the alert as a false positive. auto-buy is the path that refills credits at zero balance, and appointment reminders have no backup scheduler — that work simply does not happen and nobody is told. The two jobs with the widest blind spot are the two that were storming.

**Fix:** Return grace_minutes from find_overdue_crons (it is already computed in the `expected` CTE but dropped from the RETURNS TABLE) and use it in cronAuth.ts instead of re-deriving it. The comment at lib/cronAuth.ts:135-136 claims the formula "mirrors the migration's grace values closely enough"; for 4 of 5 jobs it is tighter and harmless, for these two it is looser and defeats the check.

### [MEDIUM] The external heartbeat and check-idle-campaigns write to cron_runs but are absent from find_overdue_crons — the backstop watchdog is itself unwatched

**Where:** `supabase/migrations/cron_run_heartbeat.sql:79-84 (live function body)`

**Evidence:** find_overdue_crons' VALUES list names exactly 5 jobs (process-scheduled, process-drips, process-ai-drips, auto-buy, send-appointment-reminders). Live cron_runs contains 7 distinct job values — the other two are heartbeat (36 runs, source='backup', last 2026-08-06T15:26:53Z, i.e. 214 minutes before this audit) and check-idle-campaigns (13 runs, last 2026-08-06T09:00:37Z). Observed heartbeat gaps reach 03:01:31 (between 2026-08-06T00:54:50Z and 03:56:21Z).

**Impact:** lib/cronAuth.ts:74-75 states the external GitHub Actions heartbeat is what covers the case where ALL internal crons stop. Nothing monitors it, so if it dies the system loses its only total-outage detector silently. check-idle-campaigns is the job that implements #136 (idle 10DLC campaigns risking a $500+ carrier penalty); if it stops, the penalty accrues with no alert.

**Fix:** Add ('heartbeat', 120, 200) and ('check-idle-campaigns', 1440, 1560) to the VALUES list in find_overdue_crons. jobNameFromPath already records both correctly, so only the expectations table is missing them — which is the drift the comment at lib/cronAuth.ts:56-57 ("names must match the VALUES list ... the one place expected intervals live") was trying to prevent.

### [MEDIUM] Confirmed root cause of the drip that never delivered: scheduled_messages_status_check rejected the 'sending' claim value  _(confirms #61)_

**Where:** `app/api/cron/process-scheduled (claim write), scheduled_messages_status_check`

**Evidence:** 282 occurrences across two clusters (141x message f5653405-9c6d-4b60-b246-02d77cce085d, 141x message 771cf31f-8f98-4d70-822d-9d6a01b4e239) on /api/cron/process-scheduled between 2026-07-31T12:00:03Z and 2026-07-31T22:55:16Z: "Could not claim scheduled message ... 23514 ... new row for relation \"scheduled_messages\" violates check constraint \"scheduled_messages_status_check\"". Both failing rows carry source='drip' and bodies "Step 1 for Dripcheck - E2E drip test, please ignore." and "Step 2 for Dripcheck - should be cancelled by a reply." — the #61 test messages. The cron retried each every ~5 minutes for 11 hours and never sent either.

**Impact:** This is why the #61 end-to-end drip test never delivered an SMS. The claim-then-send pattern could never claim, so every drip message on the platform was retried forever and silently never sent. The route logged and skipped, so the cron reported success.

**Fix:** Already resolved — no action needed, but #61 can be retested. The live constraint now reads CHECK (status = ANY (ARRAY['pending','sending','sent','failed','cancelled'])), so 'sending' is permitted; it was absent when these fired. Both stuck rows are gone (SELECT by id returns zero rows) and scheduled_messages now holds only 2 sent, 2 cancelled and 1 pending, none stuck.

### [LOW] Dead HMAC verifyTelnyxSignature() still sits above the real Ed25519 verifier and is never called

**Where:** `app/api/telnyx/sms-webhook/route.ts:80`

**Evidence:** grep across app/ and lib/ returns exactly one hit for verifyTelnyxSignature — its own definition at app/api/telnyx/sms-webhook/route.ts:80. It builds an HMAC-SHA256 over `${timestamp}|${payload}` keyed with the public key, which is not how Telnyx signs; the live verification is the inline crypto.verify(null, ...) Ed25519 block at route.ts:143-181.

**Impact:** A landmine for whoever next debugs webhook auth: the function is named exactly what you would grep for, sits directly above the real check, and implements a scheme that would accept nothing. The 26 "Failed to read asymmetric key" errors took two deploys to pin down partly because the file presents two competing verifiers.

**Fix:** Delete the function at app/api/telnyx/sms-webhook/route.ts:80-101. No callers exist.

**Coverage notes:** SCOPE: all 27 clusters from get_runtime_errors(7d) were traced to source. Note that get_runtime_errors(10h) now returns "No runtime errors found" — the app is currently quiet, and the false-alert storm stopped at 2026-08-06T03:10:47Z. Most clusters had already been fixed in code between 08-03 and 08-06; those are listed as VERIFIED FIXED below so they are not re-investigated.

VERIFIED FIXED AGAINST LIVE DATA (do not re-open):
- /api/leads/upload-document 42501 "permission denied for table users" + "Upload refund of 5 points FAILED". The failing write was the old read-then-write UPDATE on users.credits via the session client. lib/pointsSupabaseServer.ts:151 now calls createServiceRoleClient().rpc('add_credits', ...) and checks `error`. Live DB confirms add_credits/deduct_credits exist as SECURITY DEFINER owned by postgres with EXECUTE granted to service_role only (authenticated=false, anon=false), which matches the #114 revoke. Fixed by 0f7f5d4/3c5df8a.
- PDF import IS working in production now. Both failure modes were fixed: `DOMMatrix is not defined` (globalThis shim, route.ts:94-99) and the missing pdf.worker.mjs. Last PDF parse error was 2026-08-04T00:18:06Z; nothing since across many deploys. The xlsx "Corrupted zip" was a genuinely malformed user file, not a bug — it refunds correctly.
- Telnyx inbound SMS is NOT being rejected and verification is NOT bypassed. "Failed to read asymmetric key" was Node rejecting Telnyx's 32-byte raw Ed25519 key passed as DER/SPKI; sms-webhook/route.ts:160-164 now prepends the 12-byte ASN.1 header. Live proof inbound flows: messages table has 31 inbound rows, 22 of them on 2026-08-04 and 2 on 2026-08-06. Failure mode is closed, not open — route.ts:129-135 returns 500 in production when TELNYX_PUBLIC_KEY is unset, and 401 on missing headers or verify failure. No silent bypass path exists.
- /api/number-pool/purchase-with-credits RLS violation on user_telnyx_numbers — route.ts:205 now uses createServiceRoleClient() for the insert.
- /api/settings/quiet-hours 42501 — same session-client class, single occurrence 2026-08-04T22:03:26Z, none since.
- /api/receptionist/respond "Missing required fields: to, message" — the caller sent `body:` where /api/telnyx/send-sms/route.ts:61 destructures `message`. Fixed at respond/route.ts:412. Live proof it now works: 18 outbound messages with automation_source='receptionist' and status='delivered'.
- Outbound delivery receipts are working. The 57 status='sent' and 4 status='queued' rows are legacy: newest is 2026-01-29 and 2026-02-16 respectively, all predating the Telnyx DLR work. Every outbound message since 2026-07-31 is 'delivered'.

COULD NOT REACH:
- "Invalid or missing cron secret — unauthorized request" x6 (last 2026-08-04T05:27:43Z): I could not identify the caller. Vercel runtime-log retention on this plan cut off before that window — get_runtime_logs over 7d returned "No logs found... window likely exceeds your plan's retention", and a 24h query timed out. Only 6 events across 6 days against routes that are otherwise authenticating fine, so this reads as an external prober or a stale manual curl rather than a broken scheduler; I cannot prove that without the logs.
- The RPC-returns-null root cause in finding #1 is NOT reproducible on demand. I called find_overdue_crons() directly as postgres and it correctly returns [] (zero overdue). The function is SECURITY DEFINER owned by postgres, which owns cron_runs, so RLS is bypassed; service_role also has rolbypassrls=true. So neither role explains a null. I am reporting the JS-side defect that turns any such blip into a page, which is provable, rather than guessing at the RPC.
- /middleware "Invalid Refresh Token: Refresh Token Not Found" x2 is normal expired-session noise, not a defect.

## cron-reality (6)

### [HIGH] find_overdue_crons returns last_ran_at:null for jobs with hundreds of rows — 40+ escalated "has never run" alerts for crons that were running fine

**Where:** `supabase/migrations/cron_run_heartbeat.sql:79 (public.find_overdue_crons); consumed by lib/cronAuth.ts:88 and app/api/cron/heartbeat/route.ts`

**Evidence:** notifications row 2026-08-05 22:35:56Z: "auto-buy: has never run; send-appointment-reminders: has never run. Noticed by process-scheduled", data.overdue = [{"job":"auto-buy","last_ran_at":null,"minutes_since":null,"expected_minutes":60},{"job":"send-appointment-reminders","last_ran_at":null,...}]. At that instant cron_runs held an auto-buy row at 2026-08-05 22:01:13.159Z and a send-appointment-reminders row at 22:01:17.431Z — 35 and 34 minutes earlier, well inside their 90/180-minute grace. Those rows are genuine, not backfilled: their xmin values (13789 and 13791) sit between the process-ai-drips row at 22:01:02 (xmin 13788) and the process-scheduled row at 22:05:17 (xmin 13793), so they were committed in real time in schedule order. Totals now: auto-buy 70 rows since 2026-08-03 22:01:48Z, send-appointment-reminders 35 rows since 2026-08-03 22:01:05Z. Running the RPC body as SQL right now returns correct timestamps for all five jobs and SELECT * FROM find_overdue_crons() returns []. 40+ escalated alerts of this shape between 2026-08-04 18:01:32Z and 2026-08-06 03:00:02Z (throttled to one per 2h, so the true firing rate is higher); they stopped abruptly at 03:00:02Z with no change to that code path, so nothing was fixed.

**Impact:** The only cron watchdog cries wolf on the two lowest-frequency jobs, escalating to email (escalate:true) roughly every two hours for 33 hours straight. That trains the on-call channel to be ignored — and it is the same channel a real outage uses. It also poisons `npm run health`: the "crons are running" assertion calls this same RPC, so the one command meant to answer "is anything broken right now" would have reported two healthy crons as dead. The external GitHub-Actions heartbeat relays the RPC verbatim with no cross-check at all.

**Fix:** This is the same fingerprint SYSTEM_STATE.md documents for get_messages_ready_to_send (#61): a LANGUAGE sql set-returning function that returns correct rows to psql and wrong/empty rows to PostgREST. That section concludes RETURNS TABLE(...) "is the one that was never affected, and it is the shape to copy" — find_overdue_crons IS RETURNS TABLE, so that mitigation is wrong and should be corrected. Do to this RPC what was done to the other three: delete it and express the check as plain PostgREST reads plus a JS interval table, or at minimum have both alert paths (cronAuth and heartbeat) derive last_ran_at only from a direct cron_runs read and use the RPC for nothing.

### [HIGH] The guard added to stop the false cron alarms discards its own {error} and reads "nothing returned" as "has never run", so it never suppressed anything

**Where:** `lib/cronAuth.ts:118-131`

**Evidence:** `const { data: actualRuns } = await admin.from('cron_runs').select('job, ran_at').in('job', ...)` — error is not destructured or checked; line 131 is `if (!seen) return true; // table agrees it has never run`. Commit bebbef9 "Record delivery outcomes at all, and stop the false cron alarms" was committed 2026-08-04 05:18Z, yet false alerts kept firing at 2026-08-04 18:01Z, 19:45Z, 20:01Z, 21:50Z, 23:00Z, 23:55Z and all through 08-05 to 2026-08-06 03:00:02Z. If the confirming read had returned rows it would have logged "⚠️ find_overdue_crons disagrees with cron_runs" and suppressed; every one of those alerts fired instead.

**Impact:** The fix written specifically to stop a lying monitor cannot distinguish "the read failed" from "the job never ran", so it defaults to waking someone. Two independent silent-failure layers now stack: the RPC lies, and the check meant to catch the lie fails open into the same alert.

**Fix:** Destructure and check the error: on a failed confirmation read, log and return without alerting (an unreadable cron_runs is a separate condition from a stopped cron). Also apply the same confirmation to app/api/cron/heartbeat/route.ts, which alerts straight off the RPC with no cross-check.

### [MEDIUM] check-idle-campaigns is scheduled and running but is not in the monitor's expected list — if it stops, nothing notices

**Where:** `supabase/migrations/cron_run_heartbeat.sql:79 (VALUES list) vs vercel.json crons`

**Evidence:** vercel.json configures 6 crons. find_overdue_crons' VALUES list names 5: process-scheduled, process-drips, process-ai-drips, auto-buy, send-appointment-reminders. cron_runs shows a 6th job actually running: check-idle-campaigns, 13 rows, first 2026-08-06 02:59:33Z, last 2026-08-06 09:00:37Z (schedule 0 9 * * *). It appears in no expected row, so find_overdue_crons can never flag it. lib/cronAuth.ts:56 claims the opposite: "a new cron is recorded without anyone remembering to register it" — recording is automatic, the expectation is not, and only the expectation produces an alert.

**Impact:** check-idle-campaigns is the guard against idle 10DLC campaigns and a $500+ carrier penalty (#136). It is the one cron whose silent death costs money directly, and it is the one cron with no detection. The heartbeat's own job name is likewise absent, but that is deliberate and documented.

**Fix:** Add ('check-idle-campaigns', 1440, 2880) to the VALUES list, and add an assertion that every distinct job in cron_runs appears in the expected list so the next unregistered cron is caught by the monitor rather than by a penalty.

### [MEDIUM] send-appointment-reminders has run 35 times against an empty calendar_events table — the reminder path has never executed past its first query in production

**Where:** `app/api/cron/send-appointment-reminders/route.ts; public.calendar_events`

**Evidence:** SELECT count(*) FROM calendar_events = 0. SELECT count(*) FROM messages WHERE automation_source='appointment_reminder' = 0. calendar_events with reminder_sent_at NOT NULL = 0. Meanwhile cron_runs has 35 send-appointment-reminders rows on a clean 2-hour cadence (biggest gap 02:01:03). Additionally, its own quiet-hours guard (21:00–09:00 America/New_York) covers 01:00–13:00 UTC, which is exactly the runs at 02, 04, 06, 08, 10 and 12 UTC — half of the 12 daily invocations return early by design before reading anything.

**Impact:** Everything downstream of "Flow books the appointment" is unverified in production: no appointment has ever been written, so no reminder has ever been charged, claimed, sent or logged. The route carries at least four fixed-but-unexercised hazards (#71 claim-before-send, #45 credit charge, #40 DNC gate, #126 missing message_sid) whose first real test will be a paying customer's appointment. The product page promises appointments booked by Flows appear on the dashboard and in Google Calendar; the live table backing that is empty.

**Fix:** Run one end-to-end appointment: book through a Flow, confirm a calendar_events row, then let the 2-hourly cron send the reminder and confirm the messages row carries message_sid and reaches 'delivered'. Related to the open end-to-end item #61/#17.

### [MEDIUM] auto-buy has run 70 times and the column it selects on is false for all 7 accounts — the cron can never fire for anyone  _(confirms #159)_

**Where:** `app/api/cron/auto-buy/route.ts:52-53 (.eq('auto_topup', true)); public.users`

**Evidence:** SELECT count(*) FROM users = 7; count(*) WHERE auto_topup = 0; count(*) WHERE stripe_customer_id IS NOT NULL = 1. cron_runs holds 70 auto-buy rows on a clean hourly cadence since 2026-08-03 22:01:48Z. The live column set is auto_topup / auto_topup_threshold / auto_topup_amount (auto_topup_enabled does not exist).

**Impact:** Runtime confirmation of #159: the hourly charge job selects `.eq('auto_topup', true)` and no account in production has ever had that flag set, so auto-refill has never run for anybody. A user who turns auto-refill on in Settings gets a saved-looking setting and then hits zero credits with sending stopped — the exact failure the feature exists to prevent.

**Fix:** Fix the settings write per #159 (service-role client, checked error), then verify by reading users.auto_topup back after saving rather than trusting the 200.

### [LOW] process-ai-drips has run 417 times in three days and has never sent a message — every ai_drips row is stopped with messages_sent = 0

**Where:** `app/api/cron/process-ai-drips/route.ts; public.ai_drips`

**Evidence:** ai_drips holds 4 rows, all status='stopped', all messages_sent=0, all created 2026-01-20; the newest next_send_at is 2026-01-22 14:00Z, 196 days overdue. cron_runs shows 417 process-ai-drips invocations between 2026-08-03 21:40:01Z and 2026-08-06 19:00:28Z, every 10 minutes with a largest gap of 12m55s.

**Impact:** The AI-drip feature has produced zero outbound messages in its entire life, and nothing distinguishes "working, nothing due" from "nobody can create one". A cron firing 144 times a day with no throughput is indistinguishable from a broken enrolment path, which is how #97 went unnoticed for weeks.

**Fix:** Create one AI drip end to end and confirm it advances, or, if the feature is dormant pre-launch, record that in SYSTEM_STATE.md so the empty table is evidence of intent rather than an open question.

**Coverage notes:** Clean / ruled out:

VERCEL CRON REGISTRATION IS NOT THE PROBLEM. All 6 crons in vercel.json are registered and firing; no configured job is missing and no job runs that is not configured. Per-job run counts and largest observed gaps from cron_runs (source='vercel'), 2026-08-03 21:40Z → 2026-08-06 19:01Z: process-scheduled 871 runs / max gap 9m20s (*/5); process-drips 416 / 20m55s (*/10); process-ai-drips 417 / 12m55s (*/10); auto-buy 70 / 1h02m40s (hourly); send-appointment-reminders 35 / 2h01m03s (2-hourly); check-idle-campaigns 13 / daily. Every gap is inside the ~20-minute deploy pause the docs describe. Nothing looks like a plan-limit drop (Hobby caps crons at 2 and daily-only; 6 sub-daily crons all fire, so this is a paid plan). Deployment history for 08-04→08-06 shows only normal READY production deploys, no cron registration warnings.

The premise that send-appointment-reminders "has never run" is false — it has 35 real runs. The premise that auto-buy is monitored-as-never-run is true, and finding 1 covers it.

The two "backup" jobs behave as documented: process-scheduled 36 backup runs and heartbeat 36 backup runs, both from the GitHub Actions workflow (x-cron-secret), last at 2026-08-06 15:26Z. Confirmed from .github/workflows/scheduled-messages-cron.yml that the backup covers only those two endpoints — process-drips, process-ai-drips, auto-buy, send-appointment-reminders and check-idle-campaigns have no second scheduler.

process-scheduled is confirmed doing real work end to end: scheduled_messages 33392b6e-8481-4904-b537-955b07c31594 was scheduled 2026-08-06 16:17:09Z and sent_at 16:18:33Z, 84 seconds later. Drip cancellation on reply also works (d6a4f53a… cancelled with "Lead replied — drip stopped"). No pending scheduled_messages are overdue (the one pending row is due 2026-09-05).

Root cause of the RPC lie NOT established, and I did not want to guess. Ruled out with evidence: the rows are real and committed in order (xmin interleaving); the job strings are clean ASCII with no whitespace or unicode (hex-dumped all 7 distinct values); equality lookups on job return correct max(ran_at) today; the function is SECURITY DEFINER owned by postgres, cron_runs is owned by postgres with relforcerowsecurity=false, so RLS cannot be blinding it; proacl is {postgres=X/postgres,service_role=X/postgres} as intended; pg_stat_replication shows 0 replicas, so it is not replica lag. What remains is the PostgREST-vs-SQL divergence already documented in docs/SYSTEM_STATE.md around line 1420 for get_messages_ready_to_send — and that section's stated safe shape (RETURNS TABLE) is contradicted by this case.

Could not reach: Supabase get_logs only covers ~1 hour and the false-alert window closed at 2026-08-06 03:00Z, so there are no postgres/postgrest logs left from it. I made no writes of any kind; every query was a SELECT.

## data-integrity (11)

### [CRITICAL] A DNC opt-out row was created and then silently DELETED from dnc_list 3.5 minutes later — 16 of 17 lifetime DNC rows are gone and dnc_history records zero removals

**Where:** `public.dnc_list / public.dnc_history (phone +18887062631, user 14acd5ca-377b-4069-9b78-8ba65f70048a)`

**Evidence:** dnc_history for +18887062631, all same user_id 14acd5ca-377b-4069-9b78-8ba65f70048a:
  2026-08-06 16:55:20.349102+00  action='added'   list_type='user'  metadata={"reason":"opt_out","source":"inbound_sms"}
  2026-08-06 16:58:26.256725+00  action='checked' list_type='user'  result=true   metadata={"reason":"opt_out","source":"inbound_sms"}
  2026-08-06 16:58:52.835516+00  action='checked' list_type='none'  result=false  metadata={"reason":null,"source":null}
check_dnc returned true at 16:58:26 and false 26 seconds later, so the dnc_list row existed and was then deleted. SELECT COUNT(*) FROM dnc_list = 1, and the only surviving row is normalized_phone='+18134658966'. dnc_global has 0 rows. pg_stat_user_tables on dnc_list: n_tup_ins=17, n_tup_del=16, n_live_tup=2. SELECT ... FROM dnc_history WHERE action IN ('added','updated','removed') returns 5 'added' + 1 'updated' and ZERO 'removed' rows — add_to_dnc logs every insert and update but nothing logs a delete. Grants confirm the hole: role_table_grants on dnc_list shows DELETE granted to both 'anon' and 'authenticated'.

**Impact:** The DNC list is the TCPA enforcement table and the product spec says an opt-out is permanent ("No ability to message them again, ever"). In production, rows are being removed — 16 of 17 ever inserted — and no audit record survives. A number that texted STOP can silently become messageable again, and if a regulator or carrier asks when a given number was on the list, the database cannot answer: dnc_history has no 'removed' action, so the deletion is invisible. This is the one integrity failure with direct legal exposure.

**Fix:** Make dnc_list append-only: revoke DELETE from anon and authenticated (and from service_role for this table), and if removals must ever be possible, route them through a SECURITY DEFINER remove_from_dnc() that writes a dnc_history row with action='removed' before/with the delete — mirroring what add_to_dnc already does for 'added'/'updated'. Add a BEFORE DELETE trigger on dnc_list that inserts the audit row unconditionally, so an out-of-band psql delete still leaves a trace. Then determine who deleted the 2026-08-06 16:58 row (Postgres logs around that timestamp) and confirm no live opt-out was lost.

### [CRITICAL] users.credits and the points_transactions ledger disagree by 109,968 credits across 4 of 7 accounts — one account's entire 30,000-credit balance has no ledger row at all

**Where:** `public.users.credits vs public.points_transactions`

**Evidence:** SELECT u.credits, SUM(pt.points_amount), u.credits - SUM(...) AS drift GROUP BY user:
  tripped620@gmail.com                 credits=59547   ledger_sum=2579     drift=+56968  (68 ledger rows)
  rios.healthcaresolutions@gmail.com   credits=29784   ledger_sum=-216     drift=+30000  (10 ledger rows, ALL of them spend — zero grant rows ever)
  trippebrowning@gmail.com             credits=209400  ledger_sum=187400   drift=+22000  (47 ledger rows)
  trippbrowning620@gmail.com           credits=4000    ledger_sum=3000     drift=+1000   (1 ledger row)
  elementp293 / 2 unpaid accounts       drift=0
Total unbacked balance: 109,968 credits. pg_stat_user_tables on points_transactions: n_tup_ins=59, n_tup_del=17 — 17 ledger rows have been deleted. The table's own COMMENT says: "Authoritative ledger of every credits change (#137). Written ONLY by deduct_credits and add_credits".

**Impact:** The ledger is documented and treated as authoritative, and it is not. For rios.healthcaresolutions@gmail.com the balance is 100% unexplained: 30,000 credits (three months of Scale) exist with no grant record whatsoever, only spend rows. Any billing dispute, refund calculation, revenue report, or credit-abuse investigation built on points_transactions will be wrong, and the #153-class exploits (unlimited credit minting by cycling plans) cannot be detected or reversed because the evidence trail does not include the grants.

**Fix:** Run a one-time reconciliation: for each user, insert a correcting 'adjustment' ledger row for the drift so SUM(points_amount) equals users.credits, then add a scheduled assertion (npm run health already has the hooks) that fails when any user drifts. Longer term, make users.credits a derived value or add a trigger on users that rejects a credits UPDATE not accompanied by a points_transactions insert — right now add_credits/deduct_credits are the intended chokepoint but nothing enforces that they were used. Also revoke DELETE on points_transactions from every role but the migration owner.

### [HIGH] No monthly credit-renewal job exists — 6 of 7 users are past their next_renewal_date, the oldest by 8 months, and only 3 subscription grants have ever been written

**Where:** `public.cron_runs / public.users.next_renewal_date`

**Evidence:** SELECT job, COUNT(*), MAX(ran_at) FROM cron_runs GROUP BY job — all 1,859 runs belong to exactly 7 jobs: process-scheduled (872, last 19:05), process-drips (416), process-ai-drips (417), auto-buy (70), send-appointment-reminders (35), heartbeat (36), check-idle-campaigns (13). There is no renewal/subscription/monthly-credits job.
users.next_renewal_date, today being 2026-08-06:
  trippbrowninghealthsolutions  2025-12-07 21:40:27+00  (8 months overdue)
  elementp293                   2025-12-12 17:53:30+00
  sterlinglucas299              2026-01-16 18:41:04+00
  rios.healthcaresolutions      2026-02-24 17:20:50+00
  trippebrowning                2026-03-03 20:50:12+00
  trippbrowning620              2026-03-04 20:20:14+00
SELECT * FROM points_transactions WHERE action_type='subscription' returns exactly 3 rows totalling 9,000 points, the most recent 2026-02-02 20:20:48+00, and two of the three are still labelled "Basic subscription - monthly credits".

**Impact:** A Growth subscriber pays $30/month for 3,000 monthly credits and a Scale subscriber $98 for 10,000. Nothing in production grants them. Every account is running on whatever balance it happened to accumulate; once that is spent, sending stops and the only path back is buying a point pack — i.e. the customer pays twice for credits they already bought. This is pre-launch so the blast radius is small today, but it will hit every paying account on day one.

**Fix:** Either add a cron route that grants monthly_credits on next_renewal_date and rolls the date forward (writing a points_transactions row via add_credits), or — better — drive the grant off the Stripe invoice.paid webhook, which is the only event that proves the customer actually paid for that month. Add the renewal job to the cron-freshness assertions in npm run health so a stopped renewal is loud rather than silent.

### [HIGH] 4 of 7 accounts hold paid Growth/Scale tiers with 246,184 credits between them and no stripe_customer_id at all

**Where:** `public.users (stripe_customer_id, subscription_tier)`

**Evidence:** SELECT COUNT(*) FROM users WHERE subscription_tier IN ('growth','scale') AND stripe_customer_id IS NULL → 4. SUM(credits) for those 4 → 246,184. SELECT COUNT(*) FROM users WHERE stripe_customer_id IS NOT NULL → 1 (only tripped620@gmail.com, which is also the only row with a stripe_subscription_id). Per-row: trippebrowning@gmail.com tier=growth credits=209400 has_cust=false has_sub=false subscription_status='active'; rios.healthcaresolutions@gmail.com tier=scale credits=29784 has_cust=false has_sub=false subscription_status='active'; trippbrowning620@gmail.com tier=growth credits=4000; elementp293@gmail.com tier=growth credits=3000. Two further rows carry subscription_tier='unpaid' while subscription_status='active' and account_status='active'.

**Impact:** CLAUDE.md states "Payment required at signup — no free tier, no trial." The live database says otherwise: four accounts are provisioned on paid tiers, marked subscription_status='active', and hold a quarter-million credits with no Stripe customer object to bill, cancel, or dun. There is no way to revoke access or collect, and subscription_status='active' means every gate that trusts that column lets them through. The 'unpaid' tier with subscription_status='active' is a second contradiction the same gates will read inconsistently.

**Fix:** Decide which of these are seed/test accounts and mark them explicitly (account_status or onboarding_state), then add a health assertion that no user may hold subscription_tier IN ('growth','scale') without a stripe_customer_id, and that subscription_status must be derived from Stripe rather than set independently of it. Also collapse the tier/status contradiction: subscription_tier='unpaid' and subscription_status='active' should be unrepresentable.

### [HIGH] Every point-pack purchase ever recorded shows amount_paid = 0 — 188,000 credits granted for zero recorded revenue, and 209,400 of them are still live on the account  _(confirms #152)_

**Where:** `public.points_transactions (action_type='purchase'), user e103ae12-1226-40cf-bab0-4246cde33c66`

**Evidence:** SELECT ... FROM points_transactions WHERE action_type='purchase' ORDER BY created_at — 7 rows, every one with amount_paid=0 and a non-null stripe_session_id, all belonging to trippebrowning@gmail.com:
  2025-11-08 05:11:57  4000  "Starter purchased"     amount_paid=0
  2025-11-08 05:12:41  10000 "Pro purchased"         amount_paid=0
  2025-11-08 05:12:51  25000 "Business purchased"    amount_paid=0
  2025-11-08 05:13:05  60000 "Enterprise purchased"  amount_paid=0
  2025-11-08 05:13:23  60000 "Enterprise purchased"  amount_paid=0
  2025-11-08 18:42:18  25000 "Business purchased"    amount_paid=0
  2025-11-09 17:38:58  4000  "Starter purchased"     amount_paid=0
188,000 credits in total, 150,000 of it inside 86 seconds. That account's users.credits is still 209,400 today.

**Impact:** This is the residue of #152 (buyer-chosen price and credit amount) sitting in live data: the ledger cannot distinguish a paid pack from a free one because amount_paid is 0 on all of them, so revenue-per-credit and refund exposure are unknowable from the database. The 209,400 credits are still spendable — at 1 point/SMS that is 209,400 messages of Telnyx cost the platform absorbs. The pack names (Starter/Pro/Business/Enterprise) also do not match any pack in the current product.

**Fix:** Zero or adjust the unbacked balance on e103ae12-1226-40cf-bab0-4246cde33c66 after confirming against Stripe which of those 7 sessions actually collected money, and backfill amount_paid from the Stripe session for any that did. Then make amount_paid NOT NULL with no default on 'purchase' rows so a zero-revenue purchase cannot be written silently again.

### [MEDIUM] messages.points_cost is 0 on 85 of 87 outbound messages, so 1,262 points of ledger spend cannot be attributed to any message

**Where:** `public.messages.points_cost vs public.points_transactions (action_type='spend')`

**Evidence:** SELECT direction, points_cost, COUNT(*) FROM messages GROUP BY 1,2 → inbound/0: 31, outbound/0: 85, outbound/1: 2. Total points recorded on messages: 2. Meanwhile SELECT action_type, COUNT(*), SUM(points_amount) FROM points_transactions GROUP BY 1 → spend: 112 rows, -1262 points, spanning 2025-11-08 17:17:58+00 to 2026-08-06 16:55:37+00. The 4 messages stuck in status='queued' also carry points_cost=0 despite each having a message_sid (i.e. Telnyx accepted them).

**Impact:** Per-message and per-campaign cost attribution is broken. campaigns.credits_used, the /analytics credits-over-time chart, and any "what did this campaign cost me" answer are computed from a column that is zero almost everywhere, so they under-report by roughly 99%. It also means a user disputing their credit burn cannot be shown which messages consumed it — the 1,262 spent points map to 2 messages.

**Fix:** Have the send path write points_cost on the message row in the same place it calls deduct_credits (and pass the message id through so points_transactions.message_id is populated too — it exists and is unused here). Backfill historical rows from creditCalculator where segments can be recomputed from the body. Add a health assertion that SUM(spend) and SUM(messages.points_cost) stay within tolerance.

### [MEDIUM] Denormalised thread counters are wrong on all 3 threads — one shows 15 outbound against 84 actual and 47 inbound against 28 actual

**Where:** `public.threads.messages_from_user / messages_from_lead / lead_phone / lead_name`

**Evidence:** SELECT t.id, t.messages_from_user, t.messages_from_lead, (SELECT COUNT(*) FROM messages m WHERE m.thread_id=t.id AND m.direction='outbound') AS actual_out, (SELECT COUNT(*) ... 'inbound') AS actual_in FROM threads t:
  7376e8a9-faff-439f-a776-c017c41c7867  from_user=15 vs actual_out=84   from_lead=47 vs actual_in=28
  c167333a-e5da-495f-8b93-6de0874db195  from_user=0  vs actual_out=0    from_lead=3  vs actual_in=3
  481aac41-8b9a-4f73-83e9-2eebe784d305  from_user=3  vs actual_out=2    from_lead=1  vs actual_in=0
Additionally lead_name and lead_phone are NULL on all 3 threads, and lead_id is NULL on 481aac41 even though the thread has 2 outbound messages. Note thread 7376e8a9's actual_out includes the 55 provider='test' rows, but even excluding those it is 29 outbound against a stored 15, and the inbound count is over-stated in the opposite direction (47 stored, 28 real).

**Impact:** 3 of 3 threads — 100% — have counters that disagree with the messages table, in both directions, so the counters are not merely stale but wrong. Anything rendering conversation stats, unread badges, or engagement metrics from these columns shows fabricated numbers. lead_phone/lead_name being universally NULL means the denormalised copies CLAUDE.md documents are never written, so any UI reading thread.lead_phone renders blank.

**Fix:** Recompute the two counters from messages in a single backfill, then either move them to a trigger on messages INSERT or drop them and count from messages at read time (there are 3 threads and 118 messages — the join is free). Populate lead_name/lead_phone at thread creation, or delete the columns if the join to leads is the real source of truth.

### [MEDIUM] 26 of 118 messages have lead_id NULL — 24 of them outbound-delivered in the last week, so recent sends are missing from every per-lead query  _(confirms #150)_

**Where:** `public.messages.lead_id`

**Evidence:** SELECT COUNT(*) FROM messages WHERE lead_id IS NULL → 26 of 118 (22%). Broken down by direction/status: outbound/'delivered' 26 rows of which only 2 carry a lead_id (24 NULL), first 2026-07-31 04:57:07+00, last 2026-08-06 16:22:10+00; outbound/'queued' 4 rows of which 2 carry a lead_id. Every inbound message (31) and every older outbound/'sent' message (57) does have a lead_id, so this is specific to the recent outbound path. Referential integrity itself is clean: 0 messages point at a non-existent lead and 0 point at a non-existent thread.

**Impact:** Runtime confirmation of #150 and it is currently firing — 24 of the 26 messages sent since 2026-07-31 are unattributed. Lead detail views, response-rate calculations, leads.total_sent, and the flow engine's conversation history all key on lead_id and will silently omit these. The thread_id is present on 25 of 26, so the conversation still renders; only the per-lead rollups are wrong, which is exactly why this stayed invisible.

**Fix:** As #150 describes, resolve the lead by phone before the insert on the Receptionist/outbound path and set lead_id. Backfill the 26 existing rows by joining messages.to_phone to leads.phone within the same user_id. Add a NOT NULL constraint or a health assertion once the write path is fixed.

### [MEDIUM] 61 of 87 real outbound messages (70%) never reached a terminal delivery status — 4 have sat in 'queued' for six months despite having a Telnyx message_sid

**Where:** `public.messages.status`

**Evidence:** SELECT direction, status, COUNT(*), MIN(created_at), MAX(created_at) FROM messages GROUP BY 1,2:
  outbound/'sent'       57  2026-01-20 18:04:22+00 → 2026-01-29 18:20:51+00
  outbound/'delivered'  26  2026-07-31 04:57:07+00 → 2026-08-06 16:22:10+00
  outbound/'queued'      4  2026-02-05 20:02:29+00 → 2026-02-16 17:47:59+00
  inbound/'delivered'   31
The 4 'queued' rows all have has_sid=true, error_code=null, error_message=null, from_phone='+18887062631', and have been queued for ~6 months (oldest 2026-02-05 20:02:29.983+00). The 57 'sent' rows include the 55 provider='test' fixtures; excluding those, 2 real messages remain stuck at 'sent'.

**Impact:** A message with a message_sid was accepted by Telnyx but no DLR ever advanced it. Anything computing a delivery rate treats 'queued' and 'sent' as non-delivered, so the 4 six-month-old rows permanently depress the number, and more importantly a genuinely failed send is indistinguishable from one whose webhook was simply never applied — error_code and error_message are null on all four. The 26 rows since 2026-07-31 do reach 'delivered', so the DLR handler works now; these are stranded rows from when it did not.

**Fix:** Reconcile the 4 stuck rows against Telnyx by message_sid (GET only) and set their true terminal status, or age them out to 'failed' with an explicit error_message so they stop counting as in-flight. Add a health assertion that no message stays non-terminal for more than a few hours — that is the check that would have caught this in February rather than August.

### [MEDIUM] 208 of 209 leads are marked sms_opt_in = true with consent_source = 'legacy_unknown' and no consent_recorded_at — messageable in the DB, unprovable in a complaint

**Where:** `public.leads (sms_opt_in, consent_source, consent_recorded_at)`

**Evidence:** SELECT consent_source, sms_opt_in, COUNT(*), COUNT(consent_recorded_at) FROM leads GROUP BY 1,2:
  legacy_unknown / true   208 rows, 0 with consent_recorded_at, created 2025-12-08 19:55:03+00 → 2026-07-31 05:50:12+00
  inbound_message / true    1 row,  1 with consent_recorded_at, created 2026-08-06 16:51:14+00
Zero leads have sms_opt_in NULL and zero have sms_opt_in false, so nothing is currently blocked by the consent field. Cross-checking against messages: outbound messages joined to a legacy_unknown lead = 61, but COUNT(DISTINCT lead_id) = 1 — all 61 went to a single number that belongs to the operator, so no third party has actually been messaged on unproven consent yet.

**Impact:** The consent columns were added (#130) so that consent could be proved per lead, and 99.5% of the lead base carries the placeholder value that means "nothing established this" — while sms_opt_in is nonetheless true, which is the flag the send path trusts. Today the exposure is theoretical because only the operator's own number has been messaged. The moment a bulk campaign runs against this list, 208 messages go out with no consent record behind any of them, and consent_recorded_at is NULL so there is not even a date to point at.

**Fix:** Do not let consent_source='legacy_unknown' satisfy the send gate — require opt_in_form, agent_attested, or inbound_message before an outbound message to a lead, and make the operator explicitly attest the 208 legacy rows (which is what consent_source='agent_attested' exists for) before any bulk send is possible. Add a health assertion counting leads that are sms_opt_in=true with consent_source='legacy_unknown'.

### [LOW] 47% of the production messages table is test fixtures: 55 rows with user_id NULL, provider='test', from_phone '+1234567890'

**Where:** `public.messages (user_id IS NULL)`

**Evidence:** SELECT COUNT(*) FROM messages WHERE user_id IS NULL → 55 of 118. Grouped: from_phone='+1234567890', to_phone='+14079513717', provider='test', direction='outbound', status='sent', is_automated=false, count=55, first 2026-01-20 18:04:22.19+00, last 2026-01-29 18:20:51.471+00. All 55 have a valid thread_id and lead_id (also_thread_null=0, also_lead_null=0) — only the owner is missing. They are attached to thread 7376e8a9-faff-439f-a776-c017c41c7867, which belongs to a real user. auth.users and public.users reconcile exactly (7 and 7, zero orphans in either direction), so these are not remnants of a deleted account.

**Impact:** Every global count over messages is inflated by 47%, which is why thread 7376e8a9 reports 84 outbound against a stored counter of 15. Because user_id is NULL these rows are invisible to RLS and to per-user analytics, so the totals a user sees and the totals an admin or a raw query sees disagree with no obvious cause. messages.user_id being nullable at all is the underlying defect — a message with no owner cannot be billed, audited, or attributed.

**Fix:** Delete the 55 provider='test' rows from production (they are fixtures with a synthetic from_phone), then make messages.user_id NOT NULL so an ownerless message cannot be inserted again. If test rows are wanted in production, give them a real user_id and filter on provider='test' instead of leaving the owner blank.

**Coverage notes:** Checked and CLEAN — zero rows, worth recording as verified:\n\n- number_pool stuck assignments (the #173 prediction): SELECT COUNT(*) FROM number_pool WHERE is_assigned AND assigned_to_user_id IS NULL → 0. Also 0 pool rows assigned without a matching user_telnyx_numbers row. 13 pool rows total, 1 assigned (+18887062631 → 14acd5ca), 12 free but only 2 of those is_verified=true — that is #120's "2 left", unchanged.\n- Outbound messages sent AFTER a DNC row was created: 0. The one surviving dnc_list entry (+18134658966, added 2026-07-31 05:52:32+00 via inbound_sms) has never been messaged since. The DNC danger here is deletion, not leakage — see finding 1.\n- Referential integrity across the board: 0 messages with a non-existent thread_id, 0 with a non-existent lead_id, 0 threads with a non-existent lead_id, 0 threads with no messages, 0 orphaned rows in leads/clients/user_preferences/notifications/points_transactions against users, 0 clients with a dangling original_lead_id, 0 leads or messages pointing at a non-existent campaign. auth.users (7) and public.users (7) match exactly in both directions.\n- user_telnyx_numbers: 3 rows, all owned by a live user, no orphans either way.\n- scheduled_messages: 5 rows, none stuck. Terminal or correctly future-dated (2 sent, 2 cancelled with "Lead replied — drip stopped", 1 pending for 2026-09-05). drip_campaign_enrollments: 1 row, status 'paused_reply', next_send_at NULL — nothing overdue.\n- Duplicate Stripe identifiers: 0 duplicate stripe_customer_id, 0 duplicate stripe_subscription_id. Only 1 user has either, which is itself the problem (finding 4) rather than a duplication risk.\n- Users in preview/unpaid state holding credits or having sent messages: 0. Both subscription_tier='unpaid' accounts have credits=0 and 0 messages, 0 leads, 0 numbers. The violation runs the other way — paid tiers with no payment object.\n\nCouldn't reach / out of scope: I did not query Stripe or Telnyx, so "credits granted vs money actually collected" is asserted only from points_transactions.amount_paid (finding 5) and needs a Stripe-side confirmation of those 7 checkout sessions. The mechanism behind the 109,968-credit drift (finding 2) is not pinned down — add_credits defaults write_ledger=true and the three webhook call sites that pass write_ledger:false insert their own ledger row by design, so the drift predates or bypasses those paths; 17 deleted points_transactions rows (pg_stat n_tup_del) account for part but not all of it. Postgres logs only cover roughly the last hour per call, so I could not identify who deleted the 2026-08-06 16:58 DNC row or the ledger rows.

## public-surface (12)

### [CRITICAL] Live Stripe account is completely empty — every "Get Started" CTA on the public pricing table points at price IDs that do not exist in live mode  _(confirms #81)_

**Where:** `app/api/stripe/create-checkout/route.ts:13-29 (STRIPE_PRICES) vs Stripe acct_1SPlV5FmPAhggcMQ livemode`

**Evidence:** Stripe live-mode reads against acct_1SPlV5FmPAhggcMQ: GET /v1/prices?active=true → {"object":"list","data":[],"has_more":false}; GET /v1/subscriptions?status=all → data:[]; GET /v1/charges → data:[]. Meanwhile create-checkout hardcodes fixed price IDs as defaults: growth 'price_1SQtYHFyk0lZUopFNa0lT81K', scale 'price_1SQtaUFyk0lZUopFRJnuLftL', plus 8 pack prices all sharing the 'Fyk0lZUopF' account suffix — none of which exist in the live account. The live pricing table at https://hyvewyre.com/preview advertises Growth $30, Scale $98 and four packs ($40/$36, $95/$80, $225/$180, $510/$382.50) and its buttons go to /auth/register?plan=… → onboarding → this checkout route.

**Impact:** Nobody has ever paid this business in live mode: zero charges, zero subscriptions, zero customers on the only live account. The public site sells four products with a checkout that will return 'No such price' the moment the live secret key is in place. This is the single thing standing between the marketing page and revenue.

**Fix:** Create the live-mode products and prices on acct_1SPlV5FmPAhggcMQ and set STRIPE_PRICE_GROWTH/SCALE and the eight STRIPE_PRICE_PACK_* env vars on the Vercel production environment; then delete the sandbox fallbacks in create-checkout so a missing env var fails loudly instead of silently charging against a dead price. This is exactly #63 blocked on #81.

### [HIGH] middleware auth-gates the entire /public directory — manifest, service worker, PWA icons and the site logo all 307 to /auth/login for every visitor

**Where:** `middleware.ts:74-77 (matcher) and middleware.ts:12-27 (publicRoutes)`

**Evidence:** Against https://hyvewyre.com: /manifest.json → 307 location:/auth/login; /sw.js → 307; /icon-192.png → 307; /icon-512.png → 307; /logo.svg → 307; /logo-premium.png → 307; /offline.html → 307. Rendered console on a plain load of /compliance (no injection by me): [ERROR] Manifest: Line: 1, column: 1, Syntax error. @ https://hyvewyre.com/manifest.json:0 and [ERROR] The script resource is behind a redirect, which is disallowed. Reproduced explicitly: navigator.serviceWorker.register('/sw.js') → "SecurityError: Failed to register a ServiceWorker for scope ('https://hyvewyre.com/') with script ('https://hyvewyre.com/sw.js'): The script resource is behind a redirect, which is disallowed." and navigator.serviceWorker.getRegistrations() returns 0. The Playwright network log for /preview shows request 20 [GET] /manifest.json => 307 and request 21 [GET] /logo-premium.png => 307. The matcher only excludes api, _next/static, _next/image, favicon.ico, sitemap.xml and robots.txt.

**Impact:** The PWA does not exist in production: no service worker is ever registered, so offline.html, caching and any push path are dead code, and "Add to Home Screen" is unavailable because the manifest never parses. The rel=icon (/logo-premium.png) and all four apple-touch-icons resolve to an HTML login page. Every visitor logs two console errors on every page. Each of those asset requests also runs the middleware's supabase.auth.getUser(), so the landing page costs two extra Supabase auth round-trips per visitor before anything renders.

**Fix:** Extend the middleware matcher negative lookahead to exclude static public files — add manifest.json, sw.js, offline.html and a file-extension escape such as (?!.*\\.(?:png|svg|ico|json|js|webmanifest)$) — or move these assets behind a path that is already excluded. Verify with curl -I that /manifest.json and /sw.js return 200 while logged out.

### [HIGH] sitemap.xml submitted to search engines lists two URLs that redirect to the login page, and omits every legal page

**Where:** `app/sitemap.ts:7-9`

**Evidence:** https://hyvewyre.com/robots.txt advertises "Sitemap: https://hyvewyre.com/sitemap.xml". That sitemap serves exactly three URLs: /, /pricing (priority 0.9) and /features (priority 0.9). Live status checks: /pricing → HTTP/2 307 location:/auth/login; /features → HTTP/2 307 location:/auth/login. Neither route exists — ls app/(public)/ returns compliance, onboarding, opt-in, preview, privacy, refund, team, terms. /privacy, /terms, /compliance, /refund and /opt-in all return 200 but appear nowhere in the sitemap.

**Impact:** Two of the three URLs actively submitted to Google are dead redirects to a login form, which is what gets crawled and indexed as the pricing page. The legal and compliance pages a 10DLC/toll-free reviewer and Google both look for are not discoverable from the sitemap at all.

**Fix:** Rewrite app/sitemap.ts to list the routes that actually exist and are public: /, /preview, /privacy, /terms, /compliance, /refund, /opt-in. Drop /pricing and /features until those routes exist.

### [HIGH] Published Terms of Service understates credit costs by up to 3x versus what the code actually charges

**Where:** `app/(public)/terms/page.tsx §7 vs lib/pointsSupabaseServer.ts:13-19`

**Evidence:** Rendered text of https://hyvewyre.com/terms section 7: "SMS messages: 1 credit per SMS segment (160 characters) / AI-generated responses: 2 credits per response / AI chat messages: 1 credit per message / Flow generation: 5 credits per flow". The live cost table is POINT_COSTS = { sms_sent: 1, ai_response: 2, document_upload: 5, bulk_message: 2, flow_creation: 15 }. app/api/ai/chat/route.ts:22 states "2 points, the same as every other model-backed call (POINT_COSTS.ai_response)".

**Impact:** Creating a flow costs the customer 15 credits while the contract they accepted at signup says 5, and an AI chat message costs 2 while the contract says 1. Two charges are disclosed nowhere at all: bulk_message at 2 credits per contact (the single largest consumer of a balance on this platform — a 2,847-recipient campaign is 5,694 credits) and document_upload at 5. A customer disputing their burn rate has the published Terms on their side.

**Fix:** Generate the §7 list from POINT_COSTS rather than hand-writing it, the same way the pricing table already derives from lib/pointPacks.ts. Add the missing bulk-message and document-upload lines and correct flow generation to 15 and AI chat to 2.

### [HIGH] CONFIRMED: the landing page promises a same-day toll-free number with 2 assignable numbers in stock  _(confirms #120)_

**Where:** `number_pool table vs app/(public)/preview/PreviewClient.tsx (Step 2 / FAQ)`

**Evidence:** SELECT number_type, is_assigned, is_verified, count(*) FROM number_pool GROUP BY 1,2,3 → tollfree/false/false: 10, tollfree/false/true: 2, tollfree/true/true: 1. Only the two unassigned+verified rows are actually claimable; none are quarantined. The live page says "STEP 2 Get Your Number — Claim a verified toll-free number and start texting the same day" and the FAQ says "You can claim a shared toll-free number that is already verified with the carriers and start sending straight after signup".

**Impact:** The marketing site makes an unconditional same-day promise that the inventory can honour exactly twice. Signup number three fails at onboarding after the card has already been taken (payment is required at signup, no free tier). The ten unverified numbers sitting in the pool cannot be handed out until TFV clears.

**Fix:** Push the pending TFV batch (#3) so the 10 unverified numbers become assignable, and gate the signup CTA on lib/numberPoolInventory.ts rather than letting a paid signup reach an empty pool.

### [MEDIUM] "View Profile" on the landing page's Meet the Creators section drops visitors on a login screen

**Where:** `app/(public)/preview/PreviewClient.tsx (team links) and middleware.ts:12-27`

**Evidence:** Link hrefs harvested from the rendered https://hyvewyre.com/preview DOM: /team/tripp-browning and /team/carson-rios. Live: /team/tripp-browning → HTTP/2 307 location:/auth/login; /team/carson-rios → HTTP/2 307 location:/auth/login. app/(public)/team/ exists in the repo with both pages, but '/team' is absent from the middleware publicRoutes array.

**Impact:** Two visible CTAs on the marketing page bounce an unauthenticated prospect to a login form. The pages were built and shipped, and no one outside the app can reach them.

**Fix:** Add '/team' to the publicRoutes array in middleware.ts.

### [MEDIUM] Plan chosen on the public pricing table is silently discarded — the register page never reads the ?plan= param

**Where:** `app/(public)/preview/PreviewClient.tsx (pricing CTAs) vs app/auth/register/page.tsx`

**Evidence:** Link hrefs on the rendered landing page include /auth/register?plan=growth and /auth/register?plan=scale. grep over app/auth/ for useSearchParams returns only onboarding/page.tsx and login/page.tsx; register/page.tsx has no useSearchParams import and no reference to 'plan' outside prose. app/auth/onboarding/page.tsx only reads searchParams.get('step'), searchParams.get('success') and searchParams.get('calendar_connected') — never 'plan'.

**Impact:** A prospect who deliberately clicks "Get Started with Scale" ($98, the upsell tier) is asked to choose a plan again from scratch in onboarding, with no pre-selection and no memory of the choice. Intent captured at the highest-converting moment on the site is thrown away.

**Fix:** Read the plan param in register (or persist it through the email-verification round trip) and pre-select the matching tier on the onboarding plan step; onboarding already has a searchParams instance to read it from.

### [MEDIUM] The landing page contradicts itself on the Scale pack discount — FAQ says 10–18%, the pricing section says 10–25%

**Where:** `app/(public)/preview/PreviewClient.tsx:635`

**Evidence:** Rendered text from https://hyvewyre.com/preview, FAQ: "Scale members pay less on every pack — between 10% and 18% below Growth pricing depending on the size." Same page, pricing section: "SAVE UP TO 25%", "Scale members save 10–25% on every credit pack purchase vs Growth pricing". Line 635 is a hardcoded string literal; every other claim on the page renders {minScaleSavingsPct()}–{maxScaleSavingsPct()} from lib/pointPacks.ts, which computes 10 and 25 from the current prices ((510−382.50)/510 = 25%). The 18% figure is stale copy from an earlier price set — lib/pointPacks.ts's own header comment still says "ranges 10–17.6%".

**Impact:** The FAQ understates the flagship upsell benefit by 7 points and directly contradicts the pricing table two screens above it. Whichever number a prospect reads first, one of them is wrong.

**Fix:** Replace the literal in the FAQ answer with the same minScaleSavingsPct()/maxScaleSavingsPct() interpolation the pricing section uses, and update the now-stale 10–17.6% comment at the top of lib/pointPacks.ts.

### [MEDIUM] The refund policy and opt-in proof pages exist and load, but nothing on the public site links to either

**Where:** `app/(public)/preview/PreviewClient.tsx (footer) — /refund, /opt-in`

**Evidence:** Every unique href on the rendered https://hyvewyre.com/preview DOM: /auth/login, /auth/register, /auth/register?plan=growth, /auth/register?plan=scale, /team/tripp-browning, /team/carson-rios, /privacy, /terms, /compliance. /refund returns 200 and /opt-in returns 200, and neither appears in that list or in sitemap.xml. /refund-policy returns 404 and /legal/refund returns 307 to login, so a guessed URL does not find it either.

**Impact:** Stripe expects an accessible refund/cancellation policy from the checkout surface, and a carrier reviewing a 10DLC or toll-free application looks for a reachable opt-in/consent page — SYSTEM_STATE records hyvewyre.com/opt-in-proof.png as the optInWorkflowImageURLs value on the approved TFV, so reviewers are already being pointed at this domain. Both documents are written and deployed and reachable only by someone who already knows the path.

**Fix:** Add Refund Policy and SMS Opt-In to the landing-page footer next to Privacy/Terms/Compliance, and include both in app/sitemap.ts.

### [MEDIUM] Live refund policy page names "Basic or Premium plans" — tiers that do not exist

**Where:** `app/(public)/refund/page.tsx:42`

**Evidence:** Rendered /refund, under "What This Means / NOT eligible for refunds": "Monthly subscription fees (Basic or Premium plans)". The product sells Growth ($30) and Scale ($98); /terms §6 on the same site correctly says "Growth Plan: $30/month" and "Scale Plan: $98/month".

**Impact:** A customer-facing legal document excludes refunds for two plan names nobody can buy, and never names the two they can. In a chargeback dispute the policy arguably does not cover the plan actually purchased. Same stale Basic/Premium naming as #82, but on a different surface — #82 covers the Stripe product names on receipts, not this page.

**Fix:** Change to "Growth or Scale plans" and grep the remaining public pages for Basic/Premium/starter/professional while fixing #82.

### [MEDIUM] CONFIRMED: dark mode is inert on the public pages — the `dark` class is never applied anywhere in the codebase  _(confirms #134)_

**Where:** `tailwind.config.ts:3 and app/(public)/* (216 dark: variants)`

**Evidence:** On the live https://hyvewyre.com/preview: document.documentElement.className is "", data-theme is null, localStorage 'theme' is null. tailwind.config.ts sets darkMode: 'class'. grep across app, components and lib for classList.add('dark')/classList.add("dark") returns zero hits — the only match for 'darkMode' in the whole tree is the config line itself. Forcing it by hand proves the styles are also absent from the served CSS: with html.classList.add('dark'), getComputedStyle(document.body).backgroundColor stays rgb(250, 248, 245) — identical before and after. grep -o 'dark:' over app/(public) counts 216 occurrences across privacy, terms, compliance, refund, error.tsx and both team pages.

**Impact:** 216 dark: utilities on the public pages are dead weight — every one was written, reviewed and shipped for a mode that can never activate. A visitor with a dark OS theme gets the light site, and every future public page will keep accruing variants that do nothing. Because nothing in the codebase adds the class, this is not limited to the public routes.

**Fix:** Either set darkMode: 'media' so prefers-color-scheme drives it, or add a theme provider that stamps the class on <html> (and honour it on the public layout, not just the dashboard). Nothing else on #134 will show a visible change until one of those lands.

### [LOW] Global viewport meta blocks pinch-zoom on every page including the legal pages

**Where:** `app/layout.tsx:22-26`

**Evidence:** export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 } in the root layout, applied to all routes. Confirmed in the served HTML of https://hyvewyre.com/preview: <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>.

**Impact:** maximum-scale=1 prevents a mobile user from zooming, which fails WCAG 2.1 SC 1.4.4 (Resize Text). It applies to the Terms, Privacy, Compliance and Refund pages, where small dense body text is exactly where a low-vision reader needs to zoom. The product is web-only for launch, so mobile browsers are the primary surface.

**Fix:** Drop maximumScale from the viewport export in app/layout.tsx. It is a legacy iOS double-tap workaround that modern Safari no longer needs.

**Coverage notes:** Scope kept to unauthenticated navigation and reads: no login, no registration, no form submission, no checkout, no Stripe or Telnyx writes, no SQL beyond SELECT. The only page mutations were transient in-tab CSS/JS probes (adding then removing a `dark` class, one serviceWorker.register call) used to produce the dark-mode and PWA evidence.

Verified clean, so not reported:
- Pricing numbers on /preview match lib/pointPacks.ts exactly: Growth $30/3,000 and Scale $98/10,000 match CLAUDE.md; the pack table ($40/$36, $95/$80, $225/$180, $510/$382.50 for 4K/10K/25K/60K) matches POINT_PACKS row for row, and the per-row savings (10/15/20/25%) match Math.floor(scaleSavingsVsGrowthPct()). The derived claims "3.3x more credits" and "$0.0098/credit vs $0.01/credit" both check out. The only pricing defect is the hardcoded FAQ sentence reported above.
- "Credits roll over each month" is true, not marketing spin: the Stripe webhook grants via the add_credits RPC on both the subscription and renewal branches (app/api/stripe/webhook/route.ts:354, :555) and explicitly does not overwrite the balance.
- All five legal/compliance pages return 200: /privacy, /terms, /compliance, /refund, /opt-in. /opt-in-proof.png and /opt-in-proof.html also return 200, so the URL on the approved TFV record still resolves — it happens to sit in the narrow set of public assets the middleware lets through.
- /opt-in's SMS consent checkbox is unchecked by default (smsConsent checked:false), and the consent language carries frequency, rates, STOP and HELP disclosures. Its Privacy/Terms links resolve.
- /compliance is unusually honest — it has an explicit "What we do not yet have" section (no MFA, no pen test, no SOC 2) and correctly states that a local number requires TCR registration first, i.e. it does not make the false instant-local-number claim. The landing page's Step 2 and FAQ are likewise correctly hedged about 10DLC. The one unqualified overclaim I did find is the FAQ's "Yes — you can port an existing number over to HyveWyre", which CLAUDE.md lists as planned-pre-launch rather than shipped; I left it out because I could not substantiate the porting path's state from the public surface alone and it belongs to whoever is auditing the numbers area.
- Console output on the public pages is otherwise clean: the only two errors on any page are the manifest parse failure and the service-worker redirect, both from the middleware finding. No failed API calls; the only third-party traffic is Google Analytics G-QWBCNNKC08 (gtag + analytics.google.com + stats.g.doubleclick.net), all 200/204.

Out of scope for this area but visible in the 7-day Vercel runtime-error clusters, listed so it is not lost if no other agent claims it: cron_overdue alerts firing 624 times (auto-buy and send-appointment-reminders reported as "has never run", 2026-08-03T21:45 → 2026-08-06T03:10) alongside a find_overdue_crons RPC that disagrees with the cron_runs table (30 occurrences, "RPC said last_ran_at=null, table says 2026-08-04T04:00:56"); the 23514 scheduled_messages status "sending" cluster at 141 occurrences each for two specific message ids on 2026-07-31; 26 Telnyx webhook signature failures "Failed to read asymmetric key" on 2026-07-31; and the 42501 "permission denied for table users" pair on /api/leads/upload-document that produced "Upload refund of 5 points FAILED — user was charged for nothing" at 2026-08-03T23:50.

Could not reach: Vercel env var values (never read, per the rules — the live-vs-sandbox Stripe conclusion is drawn from the empty live account and the hardcoded price-ID fallbacks in source, not from any key). Supabase get_logs only covers roughly the last hour, so all runtime history above comes from the Vercel 7-day error aggregate.

## postgres-logs (6)

### [CRITICAL] START/re-subscribe writes its DNC audit row with three columns that don't exist and omits two NOT NULL ones — error unchecked, webhook returns 200

**Where:** `app/api/telnyx/sms-webhook/route.ts:727`

**Evidence:** Live schema: dnc_history columns are id,user_id,phone_number,normalized_phone,action,list_type,result,metadata,created_at,deleted_user_id,received_on_number. normalized_phone is `is_nullable: NO, column_default: null` and list_type is `is_nullable: NO, column_default: null`. The insert supplies `reason: 'opt_in'`, `source: 'inbound_sms'`, `notes: ...` (none exist) and supplies neither normalized_phone nor list_type. It is written as bare `await supabaseAdmin.from('dnc_history').insert({...})` — no `const { error }`, so nothing is checked. Live data proves it has never once succeeded: `SELECT action, list_type, count(*) FROM dnc_history GROUP BY 1,2` returns only checked/none (199), added/user (5), checked/user (4), updated/user (1), checked/global (1) — **zero rows with action='removed'**, while dnc_list currently holds 1 row against 5 recorded additions. Four DNC removals have happened with no audit record of any of them.

**Impact:** The line immediately above it (`await supabaseAdmin.from('dnc_list').delete().eq('id', dncRow.id)`) does succeed, so a number is removed from the suppression list and becomes messageable again with nothing recording that a removal occurred or that the lead consented to it. That audit row is the TCPA evidence that re-contacting the number was lawful. The webhook returns 200 and the console stays clean.

**Fix:** Replace the hand-rolled DELETE + INSERT with the `remove_from_dnc(p_user_id, p_phone_number)` RPC, which already exists and does exactly the right thing: it normalizes, deletes, and inserts dnc_history with normalized_phone and list_type='user', action='removed'. Put the free-text detail (`Lead texted: "..."`) in `metadata`, which is how lib/smsGuard.ts:444 does it. The comment at sms-webhook:544-547 already says to prefer the RPC over direct dnc_list/dnc_history writes — this block is the one that ignored it.

### [HIGH] Google Calendar access-token refresh is silently discarded on every rotation — session client cannot UPDATE that column, and none of the five call sites check the error

**Where:** `app/api/calendar/get-slots/route.ts:34-53 (and identical blocks in check-availability:35, create-event:36, book-slot:34, appointments/route.ts:191)`

**Evidence:** Live privilege check: `SELECT has_column_privilege('authenticated','public.users','google_calendar_access_token','UPDATE')` → **false**. `authenticated` holds UPDATE on exactly business_hours, business_name, timezone, updated_at. All five refresh handlers use `createClient()` (session client) and write with no destructuring at all — `await supabase.from('users').update({ google_calendar_access_token: ... }).eq('id', userId)`. Live consequence: the only user with a connection has `google_calendar_token_expiry = 2025-11-10 22:39:27+00`, i.e. `now() - expiry = 268 days 20:34:08`, while that row's `updated_at` is 2026-08-03 — the row has been written since, just never that column. Google access tokens last ~1 hour, so the refreshed token has failed to persist on every single rotation for 268 days.

**Impact:** Every calendar operation pays a full Google token-refresh round-trip because the stored access token is permanently 268 days expired, and any path that reads the stored token without refreshing gets a dead credential. Appointment booking is the payoff of the entire Flows funnel, so this degrades the product's headline outcome, and the failure is invisible — zero error checks means nothing is ever logged.

**Fix:** Use `createServiceRoleClient()` for these five writes (the request is already authenticated and the row is scoped to the session's own user.id), and capture `const { error }` on each so a future grant change surfaces instead of vanishing.

### [HIGH] DNC gate fails open in two send paths: process-drips never captures the check_dnc error, send-sms explicitly skips the block when the check errors

**Where:** `app/api/cron/process-drips/route.ts:250 and app/api/telnyx/send-sms/route.ts:331-335`

**Evidence:** process-drips writes `const { data: dncCheck } = await supabaseAdmin.rpc('check_dnc', {...})` — the error is not destructured at all — then `if (dncCheck) { ... if (dncResult.on_dnc_list) skip }`. On any RPC error dncCheck is null, the whole block is skipped, and the drip sends. send-sms is worse because it is deliberate: `if (!dncError && dncCheck) { ... }` — an errored check is treated as permission to send. lib/smsGuard.ts:432 in the same repo does the opposite and is correct: `if (dncError) { console.error('DNC check failed — blocking send'); return { allowed: false, reason: 'check_failed' } }`. These two routes bypass smsGuard entirely, which also explains why dnc_history contains 199 'checked' rows and 5 positive results but **zero rows with action='blocked'** — the blocked-send audit row is only written inside smsGuard, which neither path calls. process-drips is live: cron_runs shows 416 runs, most recent 2026-08-06 19:00:38+00.

**Impact:** A transient check_dnc failure sends an automated drip message to a number on the do-not-call list. That is the single failure this platform cannot afford — statutory TCPA damages are per message — and it happens on the cron path, unattended, with no log line and no alert.

**Fix:** Make both paths route through `checkSendAllowed()` in lib/smsGuard.ts rather than calling check_dnc directly; that gets fail-closed behaviour and the 'blocked' audit row in one change. If the direct call must stay short-term, at minimum destructure `error` and treat a failed check as a block, matching smsGuard.ts:432.

### [HIGH] Auto-refill sync to users.auto_topup* is denied by column grants and completely unchecked — confirmed live  _(confirms #159)_

**Where:** `app/api/settings/route.ts:198-206`

**Evidence:** Runtime confirmation of the theoretical issue. Live privilege check: `SELECT has_column_privilege('authenticated','public.users','auto_topup','UPDATE')` → **false** (authenticated may UPDATE only business_hours, business_name, timezone, updated_at). The route uses `const supabase = await createClient()` (session client, route.ts:115) and writes `await supabase.from('users').update({ auto_topup, auto_topup_threshold, auto_topup_amount }).eq('id', user.id)` with no `const { error }` — the comment above it reads "Sync autoRefill settings to users table so the auto-buy cron can read them". Live data across the whole tenant base: `count(*) FILTER (WHERE auto_topup IS TRUE)` = **0 of 7 users**, i.e. no account has ever successfully enabled auto-refill. The auto-buy cron itself is running fine (cron_runs: 70 rows, last 2026-08-06 19:00:35+00), so it wakes up every hour and finds nothing to do.

**Impact:** A user toggles auto-refill on, the route returns ok:true, the UI shows it enabled, and the flag never lands. When they hit zero credits all SMS and AI stops instead of auto-purchasing — the exact scenario auto-refill was sold to prevent.

**Fix:** Use createServiceRoleClient() for this write and check the returned error before responding ok:true.

### [MEDIUM] Velocity spam protection has never recorded a single send — its only writer inserts two columns that do not exist on sending_history

**Where:** `app/api/spam/history/route.ts:73`

**Evidence:** The POST inserts `phone_number` and `recipient_count`; the live table is `sending_history(id,user_id,recipient_phone,message_count,sent_at)`. Neither supplied name exists. Live data: `SELECT count(*), min(sent_at), max(sent_at) FROM sending_history` → `{rows: 0, first: null, last: null}` — the table has never held a row. A repo-wide grep for `sending_history` and `/api/spam/history` finds only the route itself plus the purge list in app/api/user/delete-account/route.ts:141; no frontend or server code ever calls either verb.

**Impact:** The GET handler is described in-file as feeding "velocity checks", and Settings advertises spam protection. It reads an empty table forever, so the velocity limb of spam protection returns a clean bill of health for every account regardless of send rate. Silent in a different way from the rest: the POST does return its error to the caller, but there is no caller.

**Fix:** Decide whether velocity checking is real. If it is, rename the insert keys to recipient_phone/message_count and wire a call into the actual send paths (lib/telnyx.ts / smsGuard). If it is not, delete the route so it stops implying coverage that does not exist.

### [MEDIUM] check-idle-campaigns is scheduled in vercel.json but missing from find_overdue_crons, so the watchdog can never report it stopped

**Where:** `supabase/migrations/cron_run_heartbeat.sql (find_overdue_crons VALUES list) vs vercel.json crons`

**Evidence:** Live function body: `WITH expected(job, expected_minutes, grace_minutes) AS (VALUES ('process-scheduled',5,30),('process-drips',10,40),('process-ai-drips',10,40),('auto-buy',60,90),('send-appointment-reminders',120,180))` — five jobs. vercel.json schedules six, including `{"schedule":"0 9 * * *","path":"/api/cron/check-idle-campaigns"}`. cron_runs confirms the job is real and recording (13 rows, source 'vercel', last 2026-08-06 09:00:37+00) and already shows a 331-minute gap between 2026-08-06 03:29:10 and 09:00:37. lib/cronAuth.ts:57 states the invariant that has drifted: "The names must match the VALUES list in `find_overdue_crons`, which is the one place expected intervals live." A separate drift: cronAuth.ts:137 recomputes grace as `expected_minutes * 1.5 + 20` (110m for auto-buy, 200m for send-appointment-reminders) which disagrees with the RPC's own grace values (90 and 180), so there are two sources of truth for the same threshold.

**Impact:** check-idle-campaigns is the guard for #136 — idle 10DLC campaigns carrying a $500+ carrier penalty. It is the one cron whose silent death costs real money, and it is the one cron the watchdog is structurally unable to notice, because a job absent from the expected list simply never appears in the overdue result set.

**Fix:** Add ('check-idle-campaigns', 1440, 2880) to the VALUES list in find_overdue_crons and re-apply against the linked project. Better, derive the list from vercel.json at deploy time, or have find_overdue_crons return grace_minutes so cronAuth stops re-deriving a second, different threshold.

**Coverage notes:** LOG WINDOWS COVERED. The Supabase `postgres` and `api` log endpoints returned `FetchException: Failed to get project's logs` on six attempts spread across roughly 40 minutes; the seventh postgres call succeeded and returned one window, epoch 1786031726000–1786043583864 = 2026-08-06 15:15–19:13 UTC (~4 hours). `auth` returned a full window (2026-08-06 17:54–18:10 UTC, all GoTrue reloader/deprecation noise, no errors). `storage` and `realtime` returned empty result sets. `edge-function` was blocked by the permission classifier. I could not step further back than that single postgres window — the MCP tool takes no timestamp argument, so anything before 15:15 UTC today is unavailable to me and I have not guessed at it. To compensate I used Vercel `get_runtime_errors` over 7d (27 grouped clusters, which is where the application-side supabase-js error objects live) plus direct schema/data queries.

CONTAMINATION WARNING on the postgres window. Several errors in it are almost certainly other agents in this same audit run probing the database interactively, not production code, and I deliberately did not report them: `column "amount" does not exist` ×2, `column p.amount does not exist`, `column "status" does not exist` ×3, `column "job_name" does not exist` ×2, `column "auto_topup_enabled" does not exist`, `column "message" does not exist`, `column "created_at" does not exist`, `column reference "relname" is ambiguous`, `"array_agg" is an aggregate function` ×3, and `column s.drip_campaign_id does not exist`. I checked the last one specifically because a 42703 is exactly what this project has shipped before — `drip_campaign_id` does not appear anywhere in app/, lib/, scripts/ or supabase/migrations/, so it came from an ad-hoc query, not deployed code. Three more are genuine SQLSTATEs I could not attribute to a caller and therefore did not report as findings: `permission denied for table users` at 18:22:29Z, `new row violates row-level security policy for table "leads"` ×2 at 15:23:20Z, and `duplicate key value violates unique constraint "leads_user_id_phone_key"` ×2 at 16:54:04Z/16:54:29Z. Vercel runtime logs for 15:15–15:35Z show only /api/user/credits, /api/notifications and the three crons — no leads-route traffic at all — so those leads errors did not originate from a production request and are most likely local dev or dashboard activity. Worth re-checking if they recur with matching Vercel traffic.

CHECKED CLEAN. (1) 42P01/undefined-table: extracted all 50 distinct `.from('...')` table names across app/, lib/, components/ and scripts/ and joined them against pg_class — zero missing relations. (2) Missing RPCs: 36 distinct `.rpc('...')` names checked against pg_proc; only `exec_sql` and `get_tables_info` are absent, and both are called solely from throwaway utilities (scripts/run-sms-migration.js:39, scripts/check-database-schema.js:25), never from a route. (3) 42703 in filter clauses: wrote a scanner pairing every `.from(table)` with the following `.eq/.neq/.gt/.gte/.lt/.lte/.like/.ilike/.is/.in/.order/.contains/.overlaps` column argument and diffed against information_schema — two hits, both verified false positives (`clients.lead_id` at app/api/threads/bulk-ai-toggle/route.ts:37 belongs to the adjacent threads chain; `users.user_id` at app/api/user/delete-account/route.ts:172 is the PURGE_TABLES loop, and the users delete two lines later correctly uses `.eq('id', userId)`). (4) 42703 in write payloads: same scan over `.insert/.update/.upsert` object keys produced 13 hits, of which 9 were nested JSONB keys (leads.conversation_state in lib/flows/completeFlow.ts, lead_activities.metadata in app/api/conversations/recover/route.ts) and 4 were real — the dnc_history and sending_history findings above. (5) 42P10: every `onConflict` I inspected names a real unique index; `user_telnyx_numbers_phone_number_key` backs the `onConflict: 'phone_number'` at app/api/number-pool/purchase-with-credits/route.ts:217.

ALREADY FIXED, do not re-file. The 23514 cluster the brief cites (282 hits on scheduled_messages status 'sending') is resolved: the live constraint is now `CHECK (status = ANY (ARRAY['pending','sending','sent','failed','cancelled']))`, the Vercel error clusters for messages f5653405 and 771cf31f (141 occurrences each) stop at 2026-07-31T22:55:16Z, and the table currently holds exactly one non-terminal row (a legitimately future-dated manual message for 2026-09-05). The 42501 RLS violation on user_telnyx_numbers at /api/number-pool/purchase-with-credits (2026-07-31T04:27:52Z) is also fixed — that route now uses createServiceRoleClient() with an explanatory comment referencing #106, and `capabilities` exists on the live table with a default. The `find_overdue_crons` RPC-vs-table disagreement logged 30 times on 2026-08-04 is mitigated by the direct-read confirmation in lib/cronAuth.ts:118-147, and the RPC currently returns an empty set with all five expected jobs healthy.

COULD NOT REACH. Postgres logs older than 2026-08-06 15:15 UTC (no timestamp parameter on the tool, endpoint intermittently 500ing). Vercel runtime logs beyond ~24h (plan retention; a 7d full-text query returned "the requested window likely exceeds your plan's runtime-log retention"). Text-search queries against Vercel logs also time out at 7d, so I could not grep historically for SQLSTATE strings. I did not attempt to read any credential values, and I ran no non-SELECT SQL.

## telnyx-live (9)

### [CRITICAL] 10 of the 13 toll-free numbers on the Telnyx account have NO messaging profile — they cannot send and their inbound SMS goes nowhere

**Where:** `Telnyx account (numbers purchased 2026-08-06T03:27:24Z) vs public.number_pool; profile 40019b38-c8eb-4a0d-ba6e-3a4174db4ad2`

**Evidence:** GET /v2/phone_numbers/messaging returns an empty messaging_profile_id for +18444408220, +18445542690, +18553930552, +18555101798, +18663221053, +18665590561, +18665722949, +18668030845, +18669931043, +18776570911 — e.g. `+18776570911 mp= prod=A2P type=tollfree`. The three older toll-frees and both locals all show `mp=40019b38-c8eb-4a0d-ba6e-3a4174db4ad2`. GET /v2/messaging_profile_metrics corroborates: the only profile with traffic reports `"phone_numbers": 5`, not 15. All 10 are already rows in number_pool (created_at 2026-08-06 03:28:41.547751+00) awaiting assignment. Only two of the account's messaging profiles exist and the second one, 40019b32-c576-4908-95f3-08efbd6d07a3, has `webhook=None` and zero numbers.

**Impact:** A messaging profile is what carries the inbound webhook (https://hyvewyre.com/api/telnyx/sms-webhook). With none attached, Telnyx has nowhere to deliver an inbound SMS to these numbers and outbound sends from them are rejected. These are the entire toll-free expansion the onboarding pool depends on, and they are already billing at $1.00/month each ($10/mo) while being unusable. If one is ever handed to a signup it is a dead number: the user's first lead reply vanishes with no error anywhere.

**Fix:** PATCH each of the 10 numbers' messaging settings to messaging_profile_id 40019b38-c8eb-4a0d-ba6e-3a4174db4ad2 before any of them becomes assignable. Then close the hole that let it happen: /api/number-pool/claim and lib/numberPool.ts never touch the messaging profile (only /api/number-pool/purchase-with-credits and /api/telnyx/purchase-number set it, at order time), so a number sourced any other way — portal, script, bulk order — enters the pool unprofiled. Add a profile check to the claim path and an assertion to `npm run health` that every number_pool row's live Telnyx messaging_profile_id equals TELNYX_MESSAGING_PROFILE_ID.

### [CRITICAL] number_pool.is_verified is a one-way ratchet — code only ever sets it false, so the 10 new toll-frees can never become assignable and onboarding stays capped at 2

**Where:** `app/api/number-pool/claim/route.ts:95,121; app/api/number-pool/available/route.ts:35,68; supabase/migrations/seed_verified_tollfree_numbers.sql:16`

**Evidence:** Live pool state: 12 unassigned rows, of which only +18884610148 and +18886638510 have is_verified=true. The 10 rows created 2026-08-06 03:28:41 all carry is_verified=false. Grepping every write of that column across app/, lib/, scripts/ and supabase/ yields exactly two shapes: `.update({ is_verified: false })` (claim/route.ts:121 and available/route.ts:68, the self-healing downgrade) and `ON CONFLICT (phone_number) DO UPDATE SET is_verified = true` in the one-shot seed migration. Both readers gate on `.eq('is_verified', true)`. Meanwhile Telnyx TFV request 9b2c5fb3-69b6-5dfb-a7b8-0867ec18281d, submitted 2026-08-06T03:30:23.857Z for exactly those 10 numbers, is in state "Waiting For Vendor".

**Impact:** Even when that TFV request is approved, nothing in the system will flip is_verified to true — no cron, no route, no webhook handler. The 10 numbers will sit paid-for and permanently unassignable, and assignable onboarding inventory stays at 2, which is a hard cap on total signups (issue #120). The self-healing downgrade guarantees the count can only ever fall.

**Fix:** Give /api/telnyx/tollfree-status (which already reads live TFV state and compares it to storedVerified) the ability to promote as well as demote, or add a cron that reconciles TFV verificationStatus back into number_pool.is_verified. Until then #3's new batch buys nothing.

### [HIGH] Inbound SMS was silently dropped for ~55 minutes by a broken Telnyx webhook signature check; 6 billed inbound messages exist at Telnyx with no row in `messages`, no thread and no lead

**Where:** `/api/telnyx/sms-webhook (TELNYX_PUBLIC_KEY)`

**Evidence:** Vercel runtime errors: `❌ Webhook signature verification error: Error: Failed to read asymmetric key ... opensslErrorStack: [ 'error:0688010A:asn1 encoding routines::nested asn1 error', 'error:068000A8:asn1 encoding routines::wrong tag' ]` — count=26, route=/api/telnyx/sms-webhook, first=2026-07-31T04:57:07Z last=2026-07-31T05:40:47Z. Plus `❌ Missing Telnyx webhook signature headers (TELNYX_PUBLIC_KEY is set, verification required)` — count=6, first=2026-07-31T05:27:18Z last=2026-07-31T22:50:13Z. Diffing Telnyx CDRs (GET /v2/detail_records, last_7_days, 78 records) against `messages` shows these inbound records billed by Telnyx and absent from the DB: c1696345-ffb1-4fd8-af32-9260a3ca619e (05:25:34Z, +18134658966 -> +18135187997, $0.0075), 8313c237-93e2-4762-a6f8-8df26d639e32 (05:27:31Z), bc425e83-a6a0-43f1-94e8-9d60b42fa22f (05:31:58Z), adc23e33-3281-4b9b-a9b8-832ce22ab9de (05:38:21Z), e71b303e-f465-4ec6-98dd-500b87150061 (05:40:46Z), a377ac1b-03b3-4b41-9d71-ebb743289a92 (05:52:31Z). Confirming the loss is total: `SELECT count(*) FROM messages WHERE direction='inbound' AND from_phone LIKE '%8134658966%'` returns 0, `threads` for that number returns 0, `leads` returns 0 — while one outbound TO that number exists.

**Impact:** A real third party replied to a user's number twice and the platform has no record of it — the reply never appeared in the inbox, no thread was created, no lead was created, and Telnyx charged for the inbound anyway. Nothing backfilled it and nothing would have noticed: the signature failure returns before any DB write, so the only trace is a log line. The malformed TELNYX_PUBLIC_KEY is a single env-var edit away from silencing every inbound message on the platform again.

**Fix:** Validate TELNYX_PUBLIC_KEY at boot (crypto.createPublicKey on the ed25519 key) and fail loudly rather than per-request. Backfill the 6 lost inbound records from GET /v2/detail_records. Add a health assertion that reconciles the last 24h of Telnyx messaging CDRs against `messages` and alerts on any Telnyx record with no local row — that check is what would have surfaced this the same day.

### [HIGH] Telnyx balance is $30.69 with auto-recharge disabled — about one Growth subscriber's monthly credit allowance before all messaging hard-stops

**Where:** `Telnyx account acct (GET /v2/balance, GET /v2/payment/auto_recharge_prefs)`

**Evidence:** GET /v2/balance: `{"credit_limit": "0.00", "available_credit": "30.69", "currency": "USD", "balance": "30.69", "pending": "0.00"}`. GET /v2/payment/auto_recharge_prefs: `{"threshold_amount": "0.00", "recharge_amount": "10.00", "enabled": false, "invoice_enabled": false}`. Real blended cost from the last 7 days of CDRs: $0.406 across 78 messaging records = $0.0052/message (observed rates: 0.0040 local outbound, 0.0055 toll-free outbound, 0.0075–0.0080 inbound). Recurring number rental from GET /v2/available_phone_numbers cost_information: `monthly_cost 1.00000` for both toll-free and local, and the account holds 15 numbers = $15.00/month.

**Impact:** $30.69 buys roughly 5,900 messages if nothing else draws on it, but $15/month of number rental comes off the top first, leaving ~3,000 messages of real headroom. A single Growth subscriber is sold 3,000 credits/month at 1pt per SMS — so one active paying user can drain the entire Telnyx account inside a billing cycle. credit_limit is 0.00 and auto-recharge enabled=false, so there is no cushion: at zero, every send fails and every inbound stops, platform-wide, for every tenant at once. The configured recharge_amount of $10.00 would in any case only buy back about eight days of number rental.

**Fix:** Turn on auto-recharge with a threshold well above one month of rental (e.g. threshold $50, recharge $200), and add a Telnyx-balance assertion to `npm run health` that fails below a floor computed from live number count x $1 plus projected message volume, rather than a hardcoded number.

### [MEDIUM] A third mock 10DLC brand and a fourth mock campaign have appeared on the account since #118 was filed  _(confirms #118)_

**Where:** `Telnyx 10DLC (GET /v2/10dlc/brand, GET /v2/10dlc/campaign)`

**Evidence:** GET /v2/10dlc/brand returns totalRecords=4, three with mock=true: `4b20019f-ca77-26f7-d5ef-53f86f4d7a0e | Redwood Insurance | tcr=BS88XBG | mock=True | createdAt 2026-08-04T01:50:36.700Z | email=agent@redwoodinsurance.example`, `4b20019f-c488-4a40-1989-71dbb05214db | Mockrun Test Co | createdAt 2026-08-02T22:11:36.640Z`, `4b20019f-a0ed-54ac-a8db-10a0314ab6fe | Test Agent Brand | createdAt 2026-07-27T00:15:37.764Z`. Only 4b20019b-eba4-6bfd-8723-dca9058142e8 (HyveWyre LLC, tcr BVZ9P0U) is mock=false. Four mock campaigns hang off them (4b30019f-ca77-…, 4b30019f-c48b-…, and two under Test Agent Brand: 4b30019f-a0ee-a0c9-… and 4b30019f-a0ee-9efa-…), all with status=None. The brand listing also reports assignedCampaignsCount=0 for all three mock brands despite those campaigns existing.

**Impact:** #118 described two stuck mock brands; there are now three brands and four campaigns, so whatever creates them is still running against the live Telnyx account and the count is growing. Each is a TCR-visible artifact on the production CSP profile carrying a fake company identity (agent@redwoodinsurance.example, test@example.com), which is exactly the kind of clutter that attracts scrutiny during the per-agent brand restructuring #1 requires.

**Fix:** Delete all three mock brands and their four campaigns, and gate mock brand/campaign creation behind an explicit non-production check so the count stops climbing.

### [MEDIUM] The DB records AT&T mapping as FAILED while Telnyx now reports it as null, and registration_synced_at has been frozen since 2026-08-04  _(confirms #105)_

**Where:** `public.user_telnyx_numbers.att_mapping_status / registration_synced_at`

**Evidence:** Live: GET /v2/10dlc/phone_number_campaigns returns for both registered numbers `+18134972176 ASSIGNED att=None tmo=ADDED other=ADDED camp=CAAP953` and `+18135187997 ASSIGNED att=None tmo=ADDED other=ADDED camp=CAAP953`. DB: both rows read att_mapping_status='FAILED', tmobile_mapping_status='ADDED', other_carrier_mapping_status='ADDED', registration_synced_at='2026-08-04 01:33:33.915+00'. Telnyx's own updatedAt on the +18134972176 assignment is 2026-08-04T01:18:24.492Z, so the DB captured one snapshot and nothing has re-synced in the two days since.

**Impact:** Confirms #105 with live data and narrows it: the FAILED value is not merely cosmetic, it is stale — Telnyx no longer reports FAILED for AT&T at all, it reports null. Any UI or eligibility gate keying off att_mapping_status='FAILED' is acting on a value the provider has since retracted, and because registration_synced_at never advances it will stay wrong indefinitely.

**Fix:** Make the registration sync recurring rather than one-shot, and treat null attNumberMappingStatus as 'not yet reported' distinctly from 'FAILED' so a transient carrier state cannot latch.

### [MEDIUM] The pending TFV request asks for 10 numbers under one business name after this same account was already rejected for requesting more than 5

**Where:** `Telnyx TFV request 9b2c5fb3-69b6-5dfb-a7b8-0867ec18281d`

**Evidence:** GET /v2/messaging_tollfree/verification/requests shows four requests for businessName "HyveWyre LLC". 65ad888e-7c9c-503f-aa89-56838c719852 (2025-12-20T20:43:31.365Z) = Rejected, reason verbatim: "Additional Information Requested - Justification for more than 5 numbers per business" — for a 5-number submission. e719b1df-2753-5b40-937a-66511483a0a3 (2025-12-26) = Rejected, "Submission Editing Timed Out". 6723e639-83ee-5c48-9ec7-b550fdce868c (2026-01-10) = Verified, 5 numbers. The new one, 9b2c5fb3 (2026-08-06T03:30:23.857Z), is "Waiting For Vendor" and lists 10 numbers under the same single business name.

**Impact:** The account has already been told in writing that more than 5 numbers per business needs justification, and the prior rejection cost about three weeks of round-trips before a verified batch landed. If 9b2c5fb3 is rejected the same way, onboarding inventory stays at 2 for another multi-week cycle while all 10 numbers keep billing. This is the ISV/reseller framing #3 calls for, submitted without it.

**Fix:** Pre-empt the rejection: attach the ISV/reseller justification to 9b2c5fb3 now rather than waiting for the vendor to ask, or split it into two 5-number submissions matching the shape that was approved in January.

### [MEDIUM] Two hard-won TFV-verified toll-free numbers were released and exist in neither Telnyx nor the database

**Where:** `Telnyx TFV request 6723e639-83ee-5c48-9ec7-b550fdce868c vs GET /v2/phone_numbers and public.number_pool`

**Evidence:** The Verified request 6723e639 covers five numbers: +18887062631, +18886642550, +18886638510, +18884610148, +18884080726. GET /v2/phone_numbers (meta total_results=15) contains only three of them — +18886642550 and +18884080726 are gone from the account. Neither appears in number_pool (13 rows) nor user_telnyx_numbers (3 rows).

**Impact:** 40% of the only verified toll-free capacity the platform has ever obtained was released, and this happened while assignable onboarding inventory sits at 2. Re-obtaining them means another TFV cycle — the same cycle that has already been rejected twice. There is no record anywhere in the DB that these numbers ever existed, so nothing would flag the loss.

**Fix:** Reconcile the verified-number roster against the live account in `npm run health` and alert on any TFV-verified number that disappears, so a release of verified capacity is never silent. Check whether the delete-account release path (#161, #172) is what removed them.

### [LOW] user_telnyx_numbers.messaging_profile_id is NULL for the one assigned toll-free number while Telnyx has a profile set

**Where:** `public.user_telnyx_numbers, row for +18887062631`

**Evidence:** DB: `+18887062631 | messaging_profile_id NULL | tollfree_verification_status 'verified' | number_type 'tollfree' | status 'active'`. Telnyx: the same number reports `mp=40019b38-c8eb-4a0d-ba6e-3a4174db4ad2`. The two local numbers in the same table both carry the profile id correctly.

**Impact:** The row was written by the pool-claim path, which never records a messaging profile, so the DB and Telnyx disagree about this number. Any code that reads messaging_profile_id off the row to build a send gets undefined for pool-assigned numbers but a real value for purchased ones — an inconsistency that will only bite once pool numbers are handed out at volume.

**Fix:** Have the claim path write the messaging profile it verifies (or sets) onto the user_telnyx_numbers row, so the column means the same thing regardless of how the number was acquired.

**Coverage notes:** Checked and clean / ruled out:

- **Number reconciliation is otherwise exact.** All 15 numbers on the Telnyx account (GET /v2/phone_numbers, total_results=15) appear in the DB: 2 local + 1 toll-free in user_telnyx_numbers, 13 toll-free in number_pool. No number is billing with zero DB counterpart, and no DB row points at a number Telnyx does not hold — so there are no pure-cost orphans and no broken send paths from that direction. The only Telnyx-side numbers unaccounted for are the two released verified toll-frees reported above.
- **Webhook URL is correct everywhere it matters.** All 76 messaging CDRs that carry one show `delivery_status_webhook_url = https://hyvewyre.com/api/telnyx/sms-webhook` — production apex, no preview or stale deployment URL anywhere. Messaging profile 40019b38 has the same URL, webhook_api_version 2, no failover. The second profile 40019b32-c576-4908-95f3-08efbd6d07a3 has no webhook URL but also zero numbers attached and is not the configured TELNYX_MESSAGING_PROFILE_ID, so it is inert (I verified which profile id the env var names by substring match without reading its value).
- **No failed or undelivered messages at Telnyx in the last 7 days.** 78 CDRs: 38 inbound, 33 outbound delivered, 7 outbound showing `queued`. I chased all 7 — the CDR status field simply lags. GET /v2/messages/{id} on 40319fd7-e118-426b-901c-5a280821d3fb, 40319fd7-e1d7-4cad-a205-1e5205623ab0 and 40319fd8-007a-41d7-9533-3d8962dd7828 each returns `to_status ['delivered'], errors []` with sent_at and completed_at populated within a second of creation. Zero error codes account-wide; messaging profile metrics agree (`outbound: sent 42, delivered 42, errors 0.0`). So there is no "marked sent locally but failed at Telnyx" lie in the UI right now — the divergence runs the other way, messages Telnyx has that the DB does not.
- **10DLC production registration is healthy.** Brand 4b20019b-eba4-6bfd-8723-dca9058142e8 (HyveWyre LLC, tcr BVZ9P0U) is status OK / identityStatus VERIFIED / mock false. Its one campaign 4b30019f-a9aa-5d53-15ff-8fab24597ea8 (tcr CAAP953) is status ACTIVE, usecase MIXED, autoRenewal true, billedDate 2026-07-28, nextRenewalOrExpirationDate 2026-10-28. Both local numbers are ASSIGNED to it with tmobile and non-tmobile mapping ADDED. The campaign is carrying live traffic (`tcr_campaign_registered: REGISTERED` on outbound CDRs), so it is not idle in the sense #136 warns about.
- **Not reached / out of scope.** I could not price the 10DLC campaign's recurring carrier fee from the API, so the balance math above covers number rental and per-message cost only and is therefore optimistic. Telnyx CDRs cover the requested 7-day window; anything older than 2026-07-30 was not examined. All calls were GET; nothing was created, modified or released.

Cross-area observations I am deliberately not filing here because they belong to other auditors' areas but are firing right now: `cron_overdue` for auto-buy and send-appointment-reminders ("has never run", 624 occurrences, /api/cron/process-scheduled, through 2026-08-06T03:10:47Z); the 23514 scheduled_messages status "sending" check-constraint violation confirmed live (141 + 141 occurrences on messages 771cf31f-8f98-4d70-822d-9d6a01b4e239 and f5653405-9c6d-4b60-b246-02d77cce085d, both drip steps, 2026-07-31T12:00:03Z–22:55:16Z); the 42501 "permission denied for table users" pair on /api/leads/upload-document with the follow-on "Upload refund of 5 points FAILED — user was charged for nothing" (2026-08-03T23:50:41Z) and on /api/settings/quiet-hours (2026-08-04T22:03:26Z); and a 42501 RLS violation `new row violates row-level security policy for table "user_telnyx_numbers"` on /api/number-pool/purchase-with-credits at 2026-07-31T04:27:52Z — which is the same minute +18135187997 was purchased on Telnyx, meaning that number was ordered and billed before its DB row was (later) created.

## build-and-deploy (5)

### [HIGH] The GitHub Actions backup scheduler and external cron watchdog fire at 4% of their declared rate — the only check that survives a total Vercel outage runs ~11 times a day, not 288

**Where:** `.github/workflows/scheduled-messages-cron.yml:24 (cron: '2-59/5 * * * *')`

**Evidence:** cron_runs over the last 24h: heartbeat = 11 runs. The workflow is the ONLY caller of /api/cron/heartbeat (grep across app/, lib/, scripts/, vercel.json finds no other caller; heartbeat is deliberately absent from vercel.json crons). Declared schedule '2-59/5 * * * *' = 12/hour = 288/day. Actual = 11/day (3.8%). Independent confirmation from the co-scheduled step: process-scheduled = 300 runs/24h against Vercel's own '*/5' = 288, i.e. only ~12 workflow-contributed invocations; a gap analysis over the same window returns extra_backup_runs (gap < 4 min) = 24, which is the 2 short gaps each of ~12 backup firings creates. Observed heartbeat gaps today: 03:56 -> 06:23 (2h27m), 06:23 -> 09:16 (2h53m), 09:16 -> 11:34, 11:34 -> 13:12, 13:12 -> 15:26 (2h14m), and last_ran 2026-08-06 15:26:53Z with age 03:46:26 still open at time of audit.

**Impact:** Two documented safety nets are effectively absent. (1) The workflow exists because Vercel Cron already failed silently once (#97: three of five cron routes answered 200 on GET-only handlers and did nothing for months). If Vercel Cron stops again, scheduled SMS now sit undelivered for up to ~4 hours instead of 5 minutes. (2) /api/cron/heartbeat is described in its own header as 'the only check that survives a total outage' — a paused project, bad deploy, or rotated CRON_SECRET would go unnoticed for a mean of ~2.2h and an observed worst case of 3h46m+. The route comment budgets for 'roughly hourly' throttling; measured is 2.2-3.8 hours, 2-4x worse than the assumption the design rests on.

**Fix:** GitHub throttles schedule-triggered workflows on shared runners and drops runs entirely under load — a '*/5' schedule is not deliverable there. Move the external heartbeat to a scheduler with an SLA (a Vercel cron in a second project, cron-job.org, Upstash QStash, or GitHub's larger runners) and assert its cadence: have find_overdue_crons include 'heartbeat' itself with an expected_minutes threshold, alerting through a channel that does not depend on the app. At minimum, correct the comments in .github/workflows/scheduled-messages-cron.yml and app/api/cron/heartbeat/route.ts so they state the real ~2-4h latency rather than 'roughly hourly'.

### [HIGH] ESLint has never been installed or configured — every production build silently skips linting while printing a line that reads as if it ran

**Where:** `package.json:9 ("lint": "next lint"); no eslint dependency, no config file anywhere in the repo`

**Evidence:** package.json devDependencies contains no eslint and no eslint-config-next (full list: @types/bcryptjs, @types/json2csv, @types/luxon, @types/node, @types/react, autoprefixer, postcss, tailwindcss, typescript, vercel). node_modules has no eslint package and no eslint binary. `find . -name '.eslintrc*' -not -path './node_modules/*'` returns nothing; there is no eslint.config.* either. Running `npm run lint` does not lint — it drops into the first-run wizard: '? How would you like to configure ESLint?  > Strict (recommended) / Base / Cancel', proving it has never been completed. Build log for the current production deployment dpl_HbPCpiU42R7fDhiTeqi4JzkzuNoX goes 18:10:51 'Linting and checking validity of types ...' -> 18:11:28 'Collecting page data ...' with zero ESLint output in between; those 37 seconds are the TypeScript check alone. Corroborating: there are 0 `eslint-disable` comments anywhere in app/, components/, lib/, hooks/ — nobody has ever hit a rule.

**Impact:** ~180 API routes and 106 pages ship with zero lint coverage, and the build log line 'Linting and checking validity of types' actively conceals it. This is the missing net under this codebase's dominant bug class: @typescript-eslint/no-floating-promises catches an un-awaited supabase-js call (the exact shape behind the STOP-opt-out failures and issues #157/#159/#164/#165), and react-hooks/exhaustive-deps catches stale-closure bugs in the dashboard/texts UI. Note this is a missing check, not an active failure — next.config.mjs has neither ignoreBuildErrors nor ignoreDuringBuilds, so TypeScript genuinely is enforced and currently passes clean.

**Fix:** npm i -D eslint eslint-config-next @typescript-eslint/eslint-plugin @typescript-eslint/parser, add .eslintrc.json extending next/core-web-vitals plus a type-aware config, and turn on @typescript-eslint/no-floating-promises and no-misused-promises first — those two target the silent-failure class directly. Expect a large initial backlog; land it as warnings, then ratchet no-floating-promises to error so `next build` fails on new instances.

### [MEDIUM] /api/cron/auto-buy charges cards inside a loop with no maxDuration, while every other work-doing cron sets 60s  _(confirms #171)_

**Where:** `app/api/cron/auto-buy/route.ts:13-14 (declares dynamic and runtime, no maxDuration); loop at :69, stripe.paymentIntents.create at :100`

**Evidence:** Per-route config across all seven cron routes: process-scheduled, process-drips, process-ai-drips and send-appointment-reminders each declare `export const maxDuration = 60`; auto-buy and check-idle-campaigns declare only `dynamic` and `runtime`, so they inherit Vercel's default function timeout. auto-buy's body is `for (const user of users || [])` at line 69 with `await stripe.paymentIntents.create({...})` at line 100 — one synchronous round-trip to Stripe per user, unbatched. The route is live and running on schedule: cron_runs shows job='auto-buy' with 70 runs since 2026-08-03 22:01:48Z, 24 in the last 24h, matching its hourly '0 * * * *' registration exactly.

**Impact:** Confirms the runtime half of #171. Once the eligible-user count exceeds roughly ten, the loop exceeds the default timeout and the function is killed mid-iteration. Combined with the missing idempotency key that #171 already documents, a kill between paymentIntents.create returning and the credit grant being written produces a real charge with no credits and no dedupe key — the next hourly run charges the same card again. This has not fired yet only because live Stripe is still effectively empty; it becomes reachable on the first day auto-buy has real subscribers.

**Fix:** Add `export const maxDuration = 60` alongside the existing dynamic/runtime declarations to match the other four crons, and cap the batch per invocation the way process-scheduled does at its line 113. Neither substitutes for the idempotency key in #171 — a longer timeout moves the cliff, it does not remove it.

### [LOW] Roughly a dozen API routes dump full DYNAMIC_SERVER_USAGE stack traces into every production build log

**Where:** `app/api/dnc/list/route.ts, dnc/stats, emails, messages/threads, number-pool/available, referrals/stats, referrals/get-code, admin/users, sms/analytics, user/plan — all with 0 `export const dynamic` declarations`

**Evidence:** Build log for dpl_HbPCpiU42R7fDhiTeqi4JzkzuNoX between 18:11:33 and 18:11:39 contains repeated 12-line stack traces, e.g. "Error in list DNC route: n [Error]: Dynamic server usage: Route /api/dnc/list couldn't be rendered statically because it used `cookies`" with digest: 'DYNAMIC_SERVER_USAGE'. Confirmed by grep: each of the ten routes above has zero `export const dynamic` lines. All ten still appear correctly as ƒ (Dynamic) in the route table at 18:11:45, so nothing is misbuilt.

**Impact:** Cosmetic but corrosive: these are logged at error level during 'Generating static pages', so a genuine build-time error is easy to miss in the noise, and each route's catch block is silently exercised at build time. I checked the catch blocks in app/api/dnc/list/route.ts and app/api/number-pool/available/route.ts — both correctly return a 500 rather than an empty-but-successful payload, so this is not an instance of the silent-failure class.

**Fix:** Add `export const dynamic = 'force-dynamic'` to each of the ten routes. Next.js then skips the static-render attempt entirely and the build log goes quiet, making a real error visible when one appears.

### [LOW] Every build runs against 10-month-old browser-targeting data

**Where:** `Build log for dpl_HbPCpiU42R7fDhiTeqi4JzkzuNoX at 18:10:48`

**Evidence:** Two warnings fire on every build: "[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: npm i baseline-browser-mapping@latest -D" and "Browserslist: browsers data (caniuse-lite) is 10 months old. Please run: npx update-browserslist-db@latest". A third appears at 18:10:31: 'Warning: "vercel" found in project dependencies and will be ignored.' — the vercel CLI (^48.8.2) sits in devDependencies while the builder uses its own Vercel CLI 58.1.0.

**Impact:** Autoprefixer and the Next.js/SWC transform compute their output from caniuse-lite, so a 10-month-stale database means Tailwind CSS output carries prefixes no longer needed and may omit ones now required — a silent, low-grade CSS-correctness risk on newer browsers. The stale vercel devDependency adds install weight and is discarded by the builder anyway.

**Fix:** Run `npx update-browserslist-db@latest` and commit the lockfile change; add `npm i -D baseline-browser-mapping@latest`. Drop `vercel` from devDependencies unless a script genuinely shells out to it — the build ignores it.

**Coverage notes:** TRUE TYPE-ERROR COUNT: 0.

A plain `npx tsc --noEmit` in /Applications/hyvewyre reports exactly 2 errors, and both are false — they come from a stale local build artifact, not from source:
  .next/types/app/api/points/spend/route.ts(2,24): error TS2307: Cannot find module '../../../../../../app/api/points/spend/route.js'
  .next/types/app/api/points/spend/route.ts(5,29): error TS2307: (same)
tsconfig.json includes ".next/types/**/*.ts". The local .next/types directory is dated Aug 4 19:49 and still contains a generated type file for app/api/points/spend, a route deleted in commit b0a4619 ("Let the server decide what a phone number costs (#141)"). Re-running the identical check against a scratch tsconfig that excludes .next returns exit 0 and zero errors. I also grepped app/, components/, lib/, hooks/, scripts/ for any surviving caller of /api/points — the only hit is a comment in lib/pointsStore.ts:86 noting the endpoint was removed — so there is no dangling client reference either. Nothing to fix in source; the local .next just needs clearing. Vercel builds from a clean checkout and are unaffected.

BUILD CONFIGURATION IS HONEST. next.config.mjs contains neither `typescript.ignoreBuildErrors` nor `eslint.ignoreDuringBuilds`. TypeScript is genuinely enforced at build time and genuinely passes. The suppression problem is the opposite shape from the one I was sent to look for: nothing is being ignored, ESLint simply was never installed (finding 2).

DEPLOYED COMMIT MATCHES origin/main. Production deployment dpl_HbPCpiU42R7fDhiTeqi4JzkzuNoX is githubCommitSha f711ebdd7e9aed279c6dde6fe53b5fd52850920c on branch main, state READY, and carries the hyvewyre.com and www.hyvewyre.com aliases. `git rev-parse origin/main` = f711ebdd — exact match, so the Stripe price/quantity fix is actually live. One caveat: local HEAD is e91dd64 ("Record what the live connections show, and the trap in reading them"), one commit AHEAD of origin/main and unpushed. It touches docs only, so nothing shippable is stranded, but the SYSTEM_STATE update it contains is not yet on the remote.

CLEAN — CHECKED AND FOUND NOTHING WRONG:
- All 20 most recent deployments are state=READY. No failed, errored, or cancelled builds in the window.
- No route failed to build or was skipped. All 106 pages generated (18:11:41 "✓ Generating static pages (106/106)"), ~180 API routes present in the route table, "Created all serverless functions in: 389.641ms" with no size warning. Build completed in 1m.
- No bundle-size warnings. Shared First Load JS is 87.8 kB; the heaviest pages are /dashboard 253 kB and /analytics 220 kB; middleware is 76.3 kB. Nothing near a limit and nothing that would drive cold-start timeouts on the cron routes (which are lambdas, not page bundles; lambdaRuntimeStats shows 6 nodejs functions).
- Cron registration is correct and all six vercel.json crons demonstrably run at their declared cadence. Measured over 24h against cron_runs: process-drips 144 (*/10 = 144 ✓), process-ai-drips 144 ✓, auto-buy 24 (0 * * * * ✓), send-appointment-reminders 12 (0 */2 ✓), process-scheduled 300 (*/5 = 288 plus backup ✓), check-idle-campaigns 1 scheduled run at 09:00Z (0 9 * * * ✓ — its 13 rows are a manual test burst between 02:59 and 03:29 on Aug 6, not a scheduling fault). Largest process-scheduled gap in 24h was 9m20s, consistent with the ~20-minute cron pause after a production deploy.

TWO HYPOTHESES I CHECKED AND DISCARDED — recording them so nobody re-derives them:
- Deployment protection blocking the backup scheduler. get_project_deployment_protection returns ssoProtection enabled with deploymentType "all_except_custom_domains", and the GitHub workflow curls the .vercel.app alias rather than hyvewyre.com — which looks like a 401 SSO challenge swallowing every backup run. It is not. I GET'd /api/cron/heartbeat on both hosts unauthenticated and both returned the application's own JSON body {"ok":false,"error":"Unauthorized"} with status 401, not a Vercel SSO HTML page. The production .vercel.app alias is reachable; the workflow's real problem is cadence (finding 1), not auth. Preview deployments remain SSO-protected, which is correct.
- Silent failure in the DYNAMIC_SERVER_USAGE routes. I read the catch blocks in app/api/dnc/list/route.ts and app/api/number-pool/available/route.ts expecting a 200-with-empty-payload. Both correctly return status 500, and dnc/list also checks the supabase `error` on both its select and its count. Downgraded to log noise (finding 4).

ONE ERROR CLUSTER IN THE LOGS IS MINE — DISREGARD IT. get_runtime_errors reports "❌ Invalid or missing cron secret — unauthorized request", count=2, route /api/cron/heartbeat, last=2026-08-06T19:14:11Z on dpl_HbPCpiU42R7fDhiTeqi4JzkzuNoX. That last occurrence is the unauthenticated probe I just described; I did not send and do not have CRON_SECRET. The other four clusters are all cron_overdue alerts with stale "has never run" text, last seen 2026-08-06T03:10:47Z — already documented in commit e91dd64 as the repeat-path echoing stale text, and already stale.

NOT REACHED: I could not measure actual per-invocation duration for /api/cron/auto-buy to show how close it runs to the default timeout — get_runtime_logs timed out on every window I tried, including 24h scoped by query string, and the tool advises narrowing to a single deploymentId. Finding 3 therefore rests on route configuration plus confirmed run counts, not on an observed timeout. No FUNCTION_INVOCATION_TIMEOUT appears in the 7-day aggregated error clusters, so if auto-buy has ever been killed mid-loop it did not surface there.
