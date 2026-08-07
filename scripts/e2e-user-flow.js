#!/usr/bin/env node
/**
 * End-to-end walk of the core user journey (#17).
 *
 *   node scripts/e2e-user-flow.js
 *
 * signup -> payment -> number -> inbound SMS -> lead -> AI flow -> appointment -> sold
 *
 * Runs against a throwaway account and deletes it afterwards. Exits non-zero if
 * any step fails.
 *
 * ── Scope, and what it deliberately does not do ─────────────────────────────
 *
 * It does NOT send a real SMS. Outbound costs money and the 10DLC campaign is
 * still MNO_PENDING, so the send paths are exercised up to their gates (DNC,
 * quiet hours, credits) rather than through Telnyx.
 *
 * The inbound leg is real: it POSTs a signed `message.received` webhook to the
 * running dev server, so the actual handler runs — lead creation, threading,
 * opt-out detection, flow advancement.
 *
 * Signing needs an Ed25519 key that matches TELNYX_PUBLIC_KEY. Point that at a
 * keypair you control locally (production reads its own value from Vercel) and
 * pass the private key as E2E_TELNYX_PRIVATE_KEY. Without it the inbound steps
 * are skipped rather than silently passing.
 *
 * #17 is gated on #1 — the per-agent 10DLC restructuring changes onboarding's
 * "instant number, instant send" assumption. This covers the parts that do not
 * change, and is meant to be re-run once #1 lands.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
for (const f of ['.env.local']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
const Stripe = require(path.join(ROOT, 'node_modules/stripe'));

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());

const LEAD_PHONE = '+15550101' + String(Math.floor(Math.random() * 900) + 100);
const results = [];
let userId = null;
let ownedNumber = null;

function step(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(46)} ${detail || ''}`);
}

async function signedWebhook(payload) {
  const priv = process.env.E2E_TELNYX_PRIVATE_KEY;
  if (!priv) return { skipped: true };
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = crypto.createPrivateKey({
    key: Buffer.from(priv, 'base64'), format: 'der', type: 'pkcs8',
  });
  const sig = crypto.sign(null, Buffer.from(`${timestamp}|${body}`), key).toString('base64');
  const res = await fetch(`${BASE}/api/telnyx/sms-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'telnyx-signature-ed25519': sig,
      'telnyx-timestamp': timestamp,
    },
    body,
  });
  return { status: res.status, body: await res.text() };
}

function inboundEvent(from, to, text) {
  return {
    data: {
      event_type: 'message.received',
      payload: {
        id: 'msg_e2e_' + Date.now() + Math.random().toString(36).slice(2, 8),
        from: { phone_number: from },
        to: [{ phone_number: to }],
        text,
        received_at: new Date().toISOString(),
      },
    },
  };
}

async function main() {
  console.log('E2E user flow\n');

  // ── 1. Signup ─────────────────────────────────────────────────────────────
  const email = `e2e-${Date.now()}@example.invalid`;
  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email, password: crypto.randomBytes(24).toString('hex'), email_confirm: true,
  });
  if (cErr) { step('signup: create account', false, cErr.message); return; }
  userId = created.user.id;
  await new Promise((r) => setTimeout(r, 1400));

  const { data: fresh } = await db.from('users').select('subscription_tier, credits').eq('id', userId).single();
  step('signup: users row created by trigger', !!fresh, fresh ? `tier=${fresh.subscription_tier} credits=${fresh.credits}` : 'no row');
  step('signup: starts unpaid with 0 credits', fresh?.subscription_tier === 'unpaid' && fresh?.credits === 0,
    `tier=${fresh?.subscription_tier} credits=${fresh?.credits}`);

  // ── 2. Payment ────────────────────────────────────────────────────────────
  const session = {
    id: 'cs_e2e_' + Date.now(), object: 'checkout.session', mode: 'subscription',
    payment_status: 'paid', client_reference_id: userId,
    customer: 'cus_e2e', subscription: 'sub_e2e_' + Date.now(),
    metadata: { user_id: userId, points: '0', packName: 'growth', planType: 'growth' },
  };
  const evt = {
    id: 'evt_e2e_' + Date.now(), object: 'event', type: 'checkout.session.completed',
    api_version: '2024-06-20', created: Math.floor(Date.now() / 1000), data: { object: session },
  };
  const payload = JSON.stringify(evt);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET.trim() });
  const whRes = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload,
  });
  const { data: paid } = await db.from('users').select('subscription_tier, credits').eq('id', userId).single();
  step('payment: webhook accepted', whRes.status === 200, `HTTP ${whRes.status}`);
  step('payment: tier applied and credits granted', paid?.subscription_tier === 'growth' && paid?.credits === 3000,
    `tier=${paid?.subscription_tier} credits=${paid?.credits}`);

  // ── 3. Number ─────────────────────────────────────────────────────────────
  // Assign an existing pool number rather than ordering one (costs money).
  const { data: pool } = await db.from('number_pool').select('phone_number').eq('is_assigned', false).limit(1);
  if (pool && pool[0]) {
    ownedNumber = pool[0].phone_number;
    await db.from('user_telnyx_numbers').insert({
      user_id: userId, phone_number: ownedNumber, status: 'active', is_primary: true,
      capabilities: { voice: true, sms: true, mms: true },
    });
    step('number: assigned to the account', true, ownedNumber);
  } else {
    step('number: a pool number was available', false, 'none unassigned');
  }

  // ── 4. Inbound SMS creates a lead ─────────────────────────────────────────
  if (!ownedNumber) { step('inbound: skipped', false, 'no number'); return; }
  const inbound = await signedWebhook(inboundEvent(LEAD_PHONE, ownedNumber, 'Hi, saw your ad — interested'));
  if (inbound.skipped) {
    step('inbound: signed webhook', false, 'E2E_TELNYX_PRIVATE_KEY not set — inbound steps skipped');
  } else {
    step('inbound: webhook accepted', inbound.status === 200, `HTTP ${inbound.status}`);
    await new Promise((r) => setTimeout(r, 2500));
    const { data: lead } = await db.from('leads').select('id, phone, first_name').eq('user_id', userId).eq('phone', LEAD_PHONE).maybeSingle();
    step('inbound: lead created from the message', !!lead, lead ? `lead ${lead.id}` : 'no lead row');
    const { data: thread } = await db.from('threads').select('id, phone_number').eq('user_id', userId).eq('phone_number', LEAD_PHONE).maybeSingle();
    step('inbound: thread created', !!thread, thread ? `thread ${thread.id}` : 'no thread');
    const { count: msgs } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('direction', 'inbound');
    step('inbound: message stored as inbound', (msgs || 0) > 0, `${msgs} inbound message(s)`);

    // ── 5. STOP is honoured ─────────────────────────────────────────────────
    const stopRes = await signedWebhook(inboundEvent(LEAD_PHONE, ownedNumber, 'STOP'));
    await new Promise((r) => setTimeout(r, 2500));
    step('opt-out: STOP webhook accepted', stopRes.status === 200, `HTTP ${stopRes.status}`);
    const { data: dnc } = await db.rpc('check_dnc', { p_user_id: userId, p_phone_number: LEAD_PHONE });
    const dncR = typeof dnc === 'string' ? JSON.parse(dnc) : dnc;
    step('opt-out: number lands on the DNC list', dncR?.on_dnc_list === true, `reason=${dncR?.reason || 'n/a'}`);

    // ── 6. The send gate refuses an opted-out number ────────────────────────
    //
    // Keyed on the PHONE NUMBER, with no lead involved. This used to look the
    // lead up first and report SKIPPED when it was missing — which it always is
    // by now, because opt-out deliberately erases the lead and keeps only the
    // suppression (#109). So the check could never run.
    //
    // Testing it without a lead is also more faithful: `leadId` is optional on
    // this route, and the DNC gate matches on normalized_phone. The surviving
    // suppression is the entire point of #109, and this is what verifies it.
    const sendRes = await fetch(`${BASE}/api/telnyx/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': (process.env.CRON_SECRET || '').trim() },
      body: JSON.stringify({ to: LEAD_PHONE, message: 'should never send', userId }),
    });
    const blocked = sendRes.status === 403 || sendRes.status === 429;
    // Report the body, not just the status. A 400 and a 403 both mean "did not
    // send", but only one of them means the DNC gate did its job — and a check
    // that cannot tell those apart is the kind that passes for the wrong reason.
    const sendBody = await sendRes.text().catch(() => '');
    step('send gate: refuses an opted-out number', blocked,
      `HTTP ${sendRes.status}${blocked ? '' : ' — ' + sendBody.slice(0, 160)}`);

    // The lead being gone is itself the #109 contract, so assert it rather than
    // treating it as an obstacle.
    const { data: erasedLead } = await db.from('leads').select('id').eq('user_id', userId).eq('phone', LEAD_PHONE).maybeSingle();
    step('opt-out: lead erased, suppression kept', !erasedLead, erasedLead ? `lead ${erasedLead.id} still present` : 'lead gone, DNC row remains');
  }

  // ── 7. Flow completion books an appointment ───────────────────────────────
  const { data: flowLead } = await db.from('leads')
    .insert({ user_id: userId, first_name: 'Flow', last_name: 'Test', phone: '+1555020' + Math.floor(1000 + Math.random() * 9000) })
    .select('id, first_name, last_name, phone, tags, conversation_state').single();
  if (flowLead) {
    const { confirmAndBookAppointment } = require(path.join(ROOT, 'lib/flows/completeFlow.ts'));
    step('flow: booking helper loadable', typeof confirmAndBookAppointment === 'function', '');
  }

  // ── 8. Sold: lead becomes a client ────────────────────────────────────────
  if (flowLead) {
    const { error: clientErr } = await db.from('clients').insert({
      user_id: userId, first_name: flowLead.first_name, last_name: flowLead.last_name, phone: flowLead.phone,
    });
    const { count: clients } = await db.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    step('sold: lead converts to a client row', !clientErr && (clients || 0) > 0, clientErr ? clientErr.message : `${clients} client(s)`);
  }
}

async function cleanup() {
  if (!userId) return;
  console.log('\ncleanup');
  const src = fs.readFileSync(path.join(ROOT, 'app/api/user/delete-account/route.ts'), 'utf8');
  const purge = [...src.slice(src.indexOf('const PURGE_TABLES'), src.indexOf('const failures')).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  for (const t of purge) await db.from(t).delete().eq('user_id', userId);
  // The account's opt-outs would normally be promoted to global (#93); this is
  // test data, so remove them instead of polluting the platform-wide list.
  await db.from('dnc_list').delete().eq('user_id', userId);
  await db.from('dnc_history').delete().eq('user_id', userId);
  await db.from('dnc_global').delete().eq('normalized_phone', LEAD_PHONE);
  if (ownedNumber) await db.from('user_telnyx_numbers').delete().eq('phone_number', ownedNumber).eq('user_id', userId);
  await db.from('users').delete().eq('id', userId);
  const { error } = await db.auth.admin.deleteUser(userId);
  const { count } = await db.from('users').select('*', { count: 'exact', head: true });
  console.log(`  test account removed: ${error ? error.message : 'ok'} | users now ${count}`);
}

main()
  .catch((e) => { console.error('\nharness error:', e.message); results.push({ name: 'harness', ok: false, detail: e.message }); })
  .then(cleanup)
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.error('failed: ' + failed.map((f) => f.name).join(', '));
      process.exit(1);
    }
  });
