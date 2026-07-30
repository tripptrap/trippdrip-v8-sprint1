#!/usr/bin/env node
/**
 * Assert every environment variable the app actually needs is present.
 *
 *   node scripts/check-required-env.js                 # against .env.local
 *   node scripts/check-required-env.js --production    # against Vercel Production
 *
 * Exits non-zero when a required variable is missing, so it can gate a deploy.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * 43 variables are read across app/, lib/ and components/; 21 are set in
 * Production. Working out which of the other 22 mattered took a manual audit
 * (#84) — and the answer was not obvious: some are dead code, some have safe
 * fallbacks, some are only safe because of another variable's value.
 *
 * A missing variable does not fail at build or deploy. It fails the first time
 * a customer hits the code path that reads it, which for email or Google
 * Calendar could be weeks later. This turns that into a check.
 *
 * The three tiers below are the actual finding from #84, not a guess. Keep them
 * updated when adding a variable — the point is that someone decided, once,
 * whether each one matters.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const useProduction = process.argv.includes('--production');

/** The app is broken without these. No usable fallback exists. */
const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: 'every database read and write',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'browser auth and RLS-scoped queries',
  SUPABASE_SERVICE_ROLE_KEY: 'crons, webhooks, every service-role path',
  STRIPE_SECRET_KEY: 'checkout and subscription management',
  STRIPE_WEBHOOK_SECRET: 'webhook signature verification — every event is rejected without it',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'client-side Stripe',
  TELNYX_API_KEY: 'sending SMS and ordering numbers',
  TELNYX_PUBLIC_KEY: 'inbound webhook signature verification (fails closed in production)',
  TELNYX_MESSAGING_PROFILE_ID: 'outbound sends and number orders',
  OPENAI_API_KEY: 'AI flows, receptionist, drips',
  CRON_SECRET: 'all five cron routes reject requests without it',
  ENCRYPTION_KEY: 'at-rest encryption for porting_orders.account_pin',
  ADMIN_EMAILS: 'admin access AND every notifyAdmins() alert (#78, #80)',
  NEXT_PUBLIC_APP_URL: 'links in outbound messages and internal fetches',
};

/**
 * Required only in combination with something else. Checking these is the point
 * of the script — SERVICE_EMAIL_PROVIDER decides which credentials matter, and
 * getting it wrong disables email with no error anyone sees (#85).
 */
const CONDITIONAL = [
  {
    when: (env) => (env.SERVICE_EMAIL_PROVIDER || 'smtp').trim() === 'sendgrid',
    need: ['SENDGRID_API_KEY'],
    why: 'SERVICE_EMAIL_PROVIDER is "sendgrid"',
  },
  {
    // SMTP_HOST is in here rather than OPTIONAL: without it the transport
    // silently defaults to smtp.gmail.com, which is not the mail host for a
    // PrivateEmail (or any other) account, so auth fails with an opaque error
    // instead of saying the app is misconfigured.
    when: (env) => (env.SERVICE_EMAIL_PROVIDER || 'smtp').trim() !== 'sendgrid',
    need: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'],
    why: 'SERVICE_EMAIL_PROVIDER is not "sendgrid", so the SMTP branch is used',
  },
];

/**
 * Read by code but safe to omit — each has a fallback that was checked (#84).
 * Listed so the next audit doesn't have to re-derive them.
 */
const OPTIONAL = {
  TIMEZONE: "falls back to 'America/New_York' for calendar slots",
  NEXT_PUBLIC_SITE_URL: "falls back to https://hyvewyre.com — verified to serve 200",
  SERVICE_EMAIL_FROM_NAME: "falls back to 'HyveWyre'",
  SERVICE_EMAIL_FROM: "falls back to noreply@hyvewyre.com",
  SMTP_PORT: "defaults to 587; PrivateEmail uses 465 (SSL) or 587 (STARTTLS)",
  SMTP_SECURE: "must be 'true' when SMTP_PORT is 465 — implicit SSL, not STARTTLS",
  GOOGLE_CLIENT_ID: 'Google Calendar OAuth — the feature is optional per user',
  GOOGLE_CLIENT_SECRET: 'Google Calendar OAuth — the feature is optional per user',
  SYSTEM_API_KEY: 'internal service-to-service calls; both sides read the same var',
  SUPABASE_JWT_SECRET: 'unused',
  // The eleven Stripe price ids fall back to hardcoded values that are only
  // correct while the key points at the sandbox that owns them. They become
  // REQUIRED the moment a live key is set — see docs/STRIPE_LIVE_MIGRATION.md.
  STRIPE_PRICE_GROWTH: 'falls back to a sandbox id — REQUIRED with a live key (#81)',
  STRIPE_PRICE_SCALE: 'falls back to a sandbox id — REQUIRED with a live key (#81)',
  STRIPE_PHONE_NUMBER_PRICE_ID: 'falls back to a sandbox id — REQUIRED with a live key (#81)',
};
for (const tier of ['GROWTH', 'SCALE']) {
  for (const pack of ['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE']) {
    OPTIONAL[`STRIPE_PRICE_PACK_${tier}_${pack}`] =
      'falls back to a sandbox id — REQUIRED with a live key (#81)';
  }
}

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  }
  return out;
}

function loadEnv() {
  if (!useProduction) return { env: parseEnvFile(path.join(ROOT, '.env.local')), cleanup: () => {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envchk-'));
  const tmp = path.join(dir, '.env');
  execFileSync('vercel', ['env', 'pull', tmp, '--environment=production', '--yes'], {
    cwd: ROOT, stdio: 'ignore',
  });
  return {
    env: parseEnvFile(tmp),
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

const { env, cleanup } = loadEnv();
try {
  console.log(`Required-env check — source: ${useProduction ? 'Vercel Production' : '.env.local'}\n`);

  const present = (n) => typeof env[n] === 'string' && env[n].trim() !== '';
  const missing = [];

  for (const [name, why] of Object.entries(REQUIRED)) {
    if (present(name)) continue;
    missing.push({ name, why });
  }

  const conditionalMissing = [];
  for (const rule of CONDITIONAL) {
    if (!rule.when(env)) continue;
    for (const name of rule.need) {
      if (!present(name)) conditionalMissing.push({ name, why: rule.why });
    }
  }

  console.log(`  required:     ${Object.keys(REQUIRED).length - missing.length}/${Object.keys(REQUIRED).length} present`);
  console.log(`  conditional:  ${conditionalMissing.length === 0 ? 'satisfied' : conditionalMissing.length + ' missing'}`);
  console.log(`  optional:     ${Object.keys(OPTIONAL).filter(present).length}/${Object.keys(OPTIONAL).length} present (safe either way)`);

  // Trailing whitespace silently broke an exact string comparison once (#85).
  const whitespace = Object.keys({ ...REQUIRED, ...OPTIONAL })
    .filter((n) => typeof env[n] === 'string' && env[n] !== env[n].trim());
  if (whitespace.length) {
    console.log(`\n⚠️  ${whitespace.length} value(s) have leading/trailing whitespace — see #85:`);
    for (const n of whitespace) console.log(`     ${n}`);
  }

  if (missing.length || conditionalMissing.length) {
    console.error('\n❌ Missing:');
    for (const m of [...missing, ...conditionalMissing]) {
      console.error(`     ${m.name.padEnd(36)} ${m.why}`);
    }
    process.exit(1);
  }

  console.log('\n✅ Every required variable is present.');
} finally {
  cleanup();
}
