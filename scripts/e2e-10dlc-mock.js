#!/usr/bin/env node
/**
 * End-to-end walk of per-agent 10DLC registration, in MOCK mode (#1).
 *
 *   TELNYX_10DLC_MOCK=true node scripts/e2e-10dlc-mock.js
 *
 * signup -> register (brand + campaign) -> refresh -> status -> cleanup
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * #1's open list said "no live user has gone through the new flow". The only
 * registration that has ever existed was filed under HyveWyre's own identity, so
 * everything the flow does FOR AN ACTUAL AGENT was inferred from one submission
 * that took eight campaign attempts and Telnyx support to finish.
 *
 * Telnyx accepts `mock: true` on brands and campaigns: the flow runs and returns
 * real-shaped objects without contacting carriers, without the $15-per-submission
 * review fee, and without creating anything that can send. The route already
 * supports it via TELNYX_10DLC_MOCK — it just had never been exercised.
 *
 * So this costs nothing and needs nobody's real EIN.
 *
 * ── What it does NOT prove ──────────────────────────────────────────────────
 *
 * Mock brands and campaigns skip carrier review entirely. This shows the plumbing
 * works — our fields reach Telnyx in a shape it accepts, the DB row tracks it, the
 * status sync reads it back. It says nothing about whether a REAL filing would be
 * approved, which is a judgement made by TCR about the content.
 *
 * Requires a dev server on E2E_BASE_URL (default http://localhost:3000) started
 * with TELNYX_10DLC_MOCK=true, and deletes the throwaway account afterwards.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const REF = new globalThis.URL(URL).hostname.split('.')[0];
const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

const results = [];
let userId = null;
let cookie = null;

function step(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(46)} ${detail || ''}`);
}

/**
 * Build the auth cookie @supabase/ssr expects.
 *
 * The route authenticates via createServerClient + next/headers cookies, so a
 * bearer token is not enough — it has to arrive as the cookie that library reads.
 * Modern @supabase/ssr stores the session as `base64-` + base64(JSON).
 */
function sessionCookie(session) {
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
  return `sb-${REF}-auth-token=${value}`;
}

async function run() {
  console.log('10DLC mock registration\n');

  if (process.env.TELNYX_10DLC_MOCK !== 'true') {
    console.error('Refusing to run: TELNYX_10DLC_MOCK is not "true" in this process.');
    console.error('The dev server must also have it set, or this would file a REAL, billable registration.');
    process.exit(2);
  }

  // ── 1. Throwaway account ────────────────────────────────────────────────────
  const email = `e2e-10dlc-${Date.now()}@example.com`;
  const password = `Pw!${Math.random().toString(36).slice(2)}Aa1`;
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) { step('signup: user created', false, createErr.message); return; }
  userId = created.user.id;
  step('signup: user created', true, email);

  const signIn = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim() },
    body: JSON.stringify({ email, password }),
  });
  const session = await signIn.json();
  if (!session.access_token) { step('signup: session obtained', false, JSON.stringify(session).slice(0, 120)); return; }
  cookie = sessionCookie(session);
  step('signup: session obtained', true, 'auth cookie built');

  // ── 2. Register: a real-looking agent, not HyveWyre ──────────────────────────
  //
  // Deliberately an insurance agency: INSURANCE is a vertical the product's own
  // industry mapping produces, and it has never been sent to Telnyx — only
  // TECHNOLOGY has, from the HyveWyre filing.
  const payload = {
    entityType: 'PRIVATE_PROFIT',
    legalBusinessName: 'Cedar Ridge Insurance Group LLC',
    displayName: 'Cedar Ridge Insurance',
    taxId: '12-3456789',
    contactPhone: '+14075550142',
    contactEmail: 'agent@cedarridgeinsurance.com',
    website: 'https://cedarridgeinsurance.com',
    vertical: 'INSURANCE',
    whatTheyOffer: 'Medicare and life insurance plan comparisons for Florida residents',
    street: '400 Ridge Parkway',
    city: 'Orlando',
    state: 'FL',
    postalCode: '32801',
  };

  const regRes = await fetch(`${BASE}/api/telnyx/10dlc/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(payload),
  });
  const regBody = await regRes.json();
  step('register: accepted', regRes.status === 200 && regBody.ok,
    regRes.status === 200 ? '' : `HTTP ${regRes.status} — ${JSON.stringify(regBody).slice(0, 160)}`);

  // ── 3. What actually landed in the database ─────────────────────────────────
  const { data: reg } = await db
    .from('user_10dlc_registrations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  step('register: row written', !!reg, reg ? `id ${reg.id}` : 'no row');
  if (reg) {
    step('register: marked as mock', reg.is_mock === true, `is_mock=${reg.is_mock}`);
    step('register: brand created', !!reg.brand_id, reg.brand_id || 'no brand id');
    step('register: vertical stored', reg.vertical === 'INSURANCE', `vertical=${reg.vertical}`);
    step('register: business identity is the AGENT, not HyveWyre',
      reg.legal_business_name === payload.legalBusinessName,
      reg.legal_business_name);

    // A brand-new brand is PENDING, and Telnyx refuses to attach a campaign to
    // one. So registration is expected to DEFER the campaign, storing the
    // reviewed content for the status sync to submit once the brand clears.
    // Creating both in one request is what failed for every real agent (#1).
    if (reg.brand_status !== 'verified') {
      step('register: campaign deferred, not failed', reg.campaign_status === 'not_started',
        `brand=${reg.brand_status} campaign=${reg.campaign_status}`);
      step('register: reviewed content persisted for later', !!reg.campaign_content,
        reg.campaign_content ? `${Object.keys(reg.campaign_content).length} fields` : 'nothing stored');
      step('register: use case recorded for later', !!reg.pending_campaign_usecase,
        `use_case=${reg.pending_campaign_usecase}`);
      step('register: whatTheyOffer persisted', !!reg.what_they_offer, reg.what_they_offer || 'not stored');
    } else {
      step('register: campaign created inline', !!reg.campaign_id, reg.campaign_id || 'no campaign id');
      step('register: use case derived server-side', !!reg.campaign_use_case, `use_case=${reg.campaign_use_case}`);
    }
  }

  // ── 4. Validation is enforced on the SERVER, not just the form ──────────────
  const badVertical = await fetch(`${BASE}/api/telnyx/10dlc/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ ...payload, vertical: 'PLUMBING' }),
  });
  step('validation: invalid vertical refused', badVertical.status === 400, `HTTP ${badVertical.status}`);

  const badEntity = await fetch(`${BASE}/api/telnyx/10dlc/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ ...payload, entityType: 'PARTNERSHIP' }),
  });
  step('validation: invalid entity type refused', badEntity.status === 400, `HTTP ${badEntity.status}`);

  const noAuth = await fetch(`${BASE}/api/telnyx/10dlc/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  step('validation: unauthenticated refused', noAuth.status === 401, `HTTP ${noAuth.status}`);

  // ── 5. Status sync reads it back from Telnyx ────────────────────────────────
  const refRes = await fetch(`${BASE}/api/telnyx/10dlc/refresh`, { method: 'POST', headers: { cookie } });
  const refBody = await refRes.json();
  step('refresh: accepted', refRes.status === 200 && refBody.ok,
    refRes.status === 200 ? '' : `HTTP ${refRes.status}`);

  const statusRes = await fetch(`${BASE}/api/telnyx/10dlc/status`, { headers: { cookie } });
  const statusBody = await statusRes.json();
  step('status: returns the registration', statusRes.status === 200 && !!statusBody.registration,
    statusBody?.registration ? `brand=${statusBody.registration.brand_status} campaign=${statusBody.registration.campaign_status}` : '');

  // ── 6. The deferred campaign is submitted once the brand verifies ───────────
  //
  // The half a real agent could never reach. Forcing the brand to 'verified'
  // simulates the carrier decision — the sync's job is to notice and finish the
  // registration, which is the behaviour that did not exist before.
  const { data: preSync } = await db
    .from('user_10dlc_registrations').select('brand_status, campaign_id').eq('user_id', userId).maybeSingle();

  if (preSync && !preSync.campaign_id) {
    // Brand verification is NOT instant, even in mock. Telnyx returns the brand as
    // pending at creation and flips it to identityStatus VERIFIED shortly after —
    // an immediate campaign attempt gets "Cannot associate campaign with brand in
    // pending or failed status", which is the exact error that made the original
    // create-both-at-once design fail for every real agent.
    //
    // Polling here stands in for the hourly cron, which is what does this in
    // production. Nothing forces the status in the database: Telnyx is the
    // authority, and faking the row would test the harness rather than the code.
    let after = null;
    let waited = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      waited += 5;
      await fetch(`${BASE}/api/telnyx/10dlc/refresh`, { method: 'POST', headers: { cookie } });
      const { data } = await db
        .from('user_10dlc_registrations')
        .select('brand_status, campaign_id, campaign_status, campaign_use_case, campaign_failure_reason')
        .eq('user_id', userId).maybeSingle();
      after = data;
      if (after?.campaign_id) break;
    }

    step('deferred: brand reached verified', after?.brand_status === 'verified',
      `brand=${after?.brand_status} after ${waited}s`);
    step('deferred: campaign submitted by the sync', !!after?.campaign_id,
      after?.campaign_id || `still none — ${after?.campaign_failure_reason || 'no reason recorded'}`);
    step('deferred: use case carried through', !!after?.campaign_use_case,
      `use_case=${after?.campaign_use_case} status=${after?.campaign_status}`);
  }
}

async function cleanup() {
  console.log('\ncleanup');
  if (!userId) { console.log('  nothing to clean'); return; }
  await db.from('user_10dlc_registrations').delete().eq('user_id', userId);
  await db.from('users').delete().eq('id', userId);
  const { error } = await db.auth.admin.deleteUser(userId);
  const { count } = await db.from('user_10dlc_registrations').select('*', { count: 'exact', head: true });
  console.log(`  test account removed: ${error ? error.message : 'ok'} | registrations now ${count}`);
}

run()
  .catch((e) => { console.error('\nharness error:', e.message); results.push({ name: 'harness', ok: false }); })
  .then(cleanup)
  .then(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) { console.log('failed: ' + failed.map((f) => f.name).join(', ')); process.exit(1); }
  });
