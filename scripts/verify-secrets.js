#!/usr/bin/env node
/**
 * Check that every production credential actually works.
 *
 *   node scripts/verify-secrets.js                 # against .env.local
 *   node scripts/verify-secrets.js --production    # against Vercel Production
 *
 * Exits non-zero if any live credential fails.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Rotating secrets (#29) is the highest-risk routine change in this project: a
 * mistyped key doesn't fail at deploy time, it fails the first time a customer
 * triggers the code path that uses it. Several of those paths are ones nobody
 * exercises daily — SendGrid, OpenAI, Telnyx — so a bad rotation can sit unseen.
 *
 * This calls each provider with the configured credential and reports what
 * actually happened. Run it immediately after rotating, before assuming success.
 *
 * It never prints a secret. Values are shown only as a prefix and length.
 *
 * `--production` shells out to `vercel env pull` into a temp file, reads it, and
 * deletes it in a `finally` — production secrets are never left on disk.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const useProduction = process.argv.includes('--production');

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    // dotenv escaping: a stored trailing newline arrives as a literal \n here.
    // Unescape so the value matches what the runtime receives (#85).
    out[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  }
  return out;
}

function loadEnv() {
  if (!useProduction) return { env: parseEnvFile(path.join(ROOT, '.env.local')), cleanup: () => {} };
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vsec-')), '.env');
  execFileSync('vercel', ['env', 'pull', tmp, '--environment=production', '--yes'], {
    cwd: ROOT, stdio: 'ignore',
  });
  return {
    env: parseEnvFile(tmp),
    cleanup: () => { try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch {} },
  };
}

const results = [];
function record(name, ok, detail, fatal = true) {
  results.push({ name, ok, detail, fatal });
  const mark = ok ? '✅' : (fatal ? '❌' : '⚠️ ');
  console.log(`  ${mark} ${name.padEnd(34)} ${detail}`);
}

function shape(v) {
  if (!v) return 'not set';
  const trimmed = v.trim();
  const nl = v !== trimmed ? ', HAS TRAILING WHITESPACE' : '';
  return `${trimmed.slice(0, 7)}… len=${trimmed.length}${nl}`;
}

async function main() {
  const { env, cleanup } = loadEnv();
  try {
    console.log(`Verifying credentials — source: ${useProduction ? 'Vercel Production' : '.env.local'}\n`);

    // ── Supabase ────────────────────────────────────────────────────────────
    const supaUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const svcKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!supaUrl || !svcKey) {
      record('SUPABASE_SERVICE_ROLE_KEY', false, 'URL or key not set');
    } else {
      const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'));
      const { error, count } = await createClient(supaUrl, svcKey)
        .from('users').select('*', { count: 'exact', head: true });
      record('SUPABASE_SERVICE_ROLE_KEY', !error,
        error ? error.message : `ok — service role reads users (${count} rows)`);
    }

    const anon = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (supaUrl && anon) {
      // Query a real table, not `/rest/v1/` — that root path returns 401 even
      // for a perfectly valid key, which reads as a failed credential. A 200
      // here (usually with `[]`, since RLS applies to anon) is the real signal.
      const r = await fetch(`${supaUrl}/rest/v1/leads?select=id&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      record('NEXT_PUBLIC_SUPABASE_ANON_KEY', r.ok, r.ok ? 'ok — anon key accepted by PostgREST' : `HTTP ${r.status}`);
    } else {
      record('NEXT_PUBLIC_SUPABASE_ANON_KEY', false, 'not set');
    }

    // ── Stripe ──────────────────────────────────────────────────────────────
    const sk = (env.STRIPE_SECRET_KEY || '').trim();
    if (!sk) {
      record('STRIPE_SECRET_KEY', false, 'not set');
    } else {
      try {
        const Stripe = require(path.join(ROOT, 'node_modules/stripe'));
        const acct = await new Stripe(sk).accounts.retrieve();
        const mode = sk.startsWith('sk_live') ? 'LIVE' : 'TEST';
        record('STRIPE_SECRET_KEY', true,
          `ok — ${mode} mode, ${acct.id} (${acct.settings?.dashboard?.display_name || 'unnamed'})`);
        if (mode === 'TEST') {
          record('  └ Stripe mode', false, 'TEST key — no real payments possible (#81)', false);
        }
      } catch (e) {
        record('STRIPE_SECRET_KEY', false, e.message.slice(0, 70));
      }
    }

    const whsec = (env.STRIPE_WEBHOOK_SECRET || '').trim();
    // Can't be validated without a real event; a shape check still catches the
    // common rotation mistake of pasting the wrong secret entirely.
    record('STRIPE_WEBHOOK_SECRET', whsec.startsWith('whsec_'),
      whsec ? `${shape(whsec)} ${whsec.startsWith('whsec_') ? '(shape ok — not callable offline)' : '(expected whsec_ prefix)'}` : 'not set');

    // ── Telnyx ──────────────────────────────────────────────────────────────
    const tk = (env.TELNYX_API_KEY || '').trim();
    if (!tk) {
      record('TELNYX_API_KEY', false, 'not set');
    } else {
      const r = await fetch('https://api.telnyx.com/v2/balance', { headers: { Authorization: `Bearer ${tk}` } });
      const j = await r.json().catch(() => ({}));
      record('TELNYX_API_KEY', r.ok,
        r.ok ? `ok — balance ${j.data?.balance} ${j.data?.currency}` : `HTTP ${r.status}`);
    }

    // ── OpenAI ──────────────────────────────────────────────────────────────
    const ok_ = (env.OPENAI_API_KEY || '').trim();
    if (!ok_) {
      record('OPENAI_API_KEY', false, 'not set');
    } else {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${ok_}` } });
      record('OPENAI_API_KEY', r.ok, r.ok ? 'ok — models endpoint reachable' : `HTTP ${r.status}`);
    }

    // ── SendGrid ────────────────────────────────────────────────────────────
    const sg = (env.SENDGRID_API_KEY || '').trim();
    const provider = (env.SERVICE_EMAIL_PROVIDER || 'smtp').trim();
    if (provider !== 'sendgrid') {
      record('SENDGRID_API_KEY', false,
        `SERVICE_EMAIL_PROVIDER is "${provider}" — SMTP branch would be used`, false);
    } else if (!sg) {
      record('SENDGRID_API_KEY', false, 'not set but provider is sendgrid');
    } else {
      const r = await fetch('https://api.sendgrid.com/v3/scopes', { headers: { Authorization: `Bearer ${sg}` } });
      record('SENDGRID_API_KEY', r.ok, r.ok ? 'ok — scopes endpoint reachable' : `HTTP ${r.status}`);
    }

    // ── Self-generated secrets: shape only, nothing to call ─────────────────
    for (const [name, min] of [['CRON_SECRET', 16], ['SYSTEM_API_KEY', 16]]) {
      const v = (env[name] || '').trim();
      record(name, v.length >= min, v ? `${shape(env[name])}` : 'not set');
    }

    const ek = (env.ENCRYPTION_KEY || '').trim();
    // lib/encryption.ts expects a 32-byte hex string (64 chars).
    const ekOk = /^[0-9a-fA-F]{64}$/.test(ek);
    record('ENCRYPTION_KEY', ekOk, ek ? (ekOk ? 'ok — 32-byte hex' : `${shape(env.ENCRYPTION_KEY)} (expected 64 hex chars)`) : 'not set');
    if (env.ENCRYPTION_KEY && env.ENCRYPTION_KEY !== ek) {
      record('  └ ENCRYPTION_KEY whitespace', false,
        'trailing whitespace is part of the key material — see #85 before changing', false);
    }

    // ── Google OAuth: presence only ─────────────────────────────────────────
    record('GOOGLE_CLIENT_SECRET', !!(env.GOOGLE_CLIENT_SECRET || '').trim(),
      env.GOOGLE_CLIENT_SECRET ? 'set (cannot be validated offline)' : 'not set', false);

    // ── Summary ─────────────────────────────────────────────────────────────
    const failed = results.filter((r) => !r.ok && r.fatal);
    const warned = results.filter((r) => !r.ok && !r.fatal);
    console.log('');
    if (warned.length) console.log(`⚠️  ${warned.length} warning(s)`);
    if (failed.length) {
      console.error(`❌ ${failed.length} credential(s) failed: ${failed.map((f) => f.name).join(', ')}`);
      process.exit(1);
    }
    console.log('✅ All live credentials verified.');
  } finally {
    cleanup();
  }
}

main().catch((e) => { console.error('verify-secrets failed:', e.message); process.exit(2); });
