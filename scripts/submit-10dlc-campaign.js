#!/usr/bin/env node
/**
 * 10DLC campaign submission — current payload.
 *
 * Holds the payload for the NEXT submission. After each run, snapshot the
 * result with scripts/archive-10dlc-submissions.js so the attempt is preserved
 * in docs/10dlc-submissions/ and stays diffable against the ones before it.
 *
 * Every prior attempt's rejection reason was pulled from the live Telnyx API
 * and cross-referenced; this payload addresses all of them. See
 * docs/10DLC_REJECTION_HISTORY.md for the running log.
 *
 *   run:  node scripts/submit-10dlc-campaign.js
 *   dry:  node scripts/submit-10dlc-campaign.js --dry-run
 *
 * THIS PLACES A REAL SUBMISSION AND MAY INCUR A CARRIER FEE. Run it only when
 * you actually intend to submit.
 *
 * ── What each historical rejection was, and how this payload answers it ──────
 *
 * 1. "Who is the perceived sender?"  (raised 2026-07-26 and 2026-07-27)
 *    -> `description` states the campaign covers ONLY HyveWyre LLC's own
 *       first-party messages, and that platform customers register their own
 *       separate brand + campaign.
 *
 * 2. "Opt-in workflow mentions multiple methods"  (2026-07-26)
 *    -> `messageFlow` describes exactly one method and says so explicitly.
 *
 * 3. "Add a link/screenshot of the opt-in form"  (2026-07-26, 2026-07-27)
 *    -> `messageFlow` links https://hyvewyre.com/opt-in/hyvewyre-llc, which is
 *       publicly reachable and shows the phone field plus the unchecked consent
 *       checkbox. (The 2026-07-27 rejection was against the *signup* form,
 *       which had no consent language — the dedicated opt-in page fixed that.)
 *
 * 4. "Privacy Policy needs to be compliant"  (2026-07-26, 2026-07-27)
 *    -> Verified live 2026-07-28: hyvewyre.com/privacy states "Text messaging
 *       originator opt-in data and consent are not shared with any third
 *       parties for promotional or marketing purposes."
 *
 * 5. "Usecase LOW_VOLUME requires minimum of 1 sub-usecases"  (2026-07-27)
 *    -> MIXED with three sub-usecases.
 *
 * 6. "Opt-in consent language does not cover all selected use cases"  (2026-07-28)
 *    -> The consent text now names account notifications and promotional /
 *       marketing messages, covering all three sub-usecases. The string below
 *       is quoted VERBATIM from the live form — Telnyx compares them, so if
 *       lib/optInConsent.ts changes, this must change with it.
 *
 * 7. "Subscriber/Auto-response Opt-in Message needs updating"  (2026-07-26, 2026-07-28)
 *    -> `optinMessage` now names every message type the campaign declares.
 */

// Resolve .env.local from the repo root, not process.cwd(), so this runs from
// any directory.
const fs = require('fs');
const path = require('path');
// .env.local parsed inline rather than via dotenv. dotenv was removed as an
// unused dependency in #86, which broke this script — and it only surfaced when
// someone tried to submit. The other scripts here (verify-secrets,
// check-required-env, provision-stripe-catalog) already parse it this way, so
// this has one less thing that can rot between submissions.
for (const file of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim();
    }
  }
}

const DRY_RUN = process.argv.includes('--dry-run');
const key = process.env.TELNYX_API_KEY;

// The payload lives in docs/10dlc-campaign-payload.json so it can be edited
// without touching code. Edit that file, then run this script.
//
// One rule when editing: `messageFlow` quotes the opt-in consent text VERBATIM,
// and Telnyx compares it against the live form at
// https://hyvewyre.com/opt-in/hyvewyre-llc. Attempt 6 was rejected for exactly
// that drift. If you change the consent wording, change it in
// lib/optInConsent.ts first, deploy, confirm it live, and only then mirror it
// here — the check below will refuse to submit if they disagree.
const PAYLOAD_FILE = path.join(__dirname, '..', 'docs', '10dlc-campaign-payload.json');
const payload = JSON.parse(fs.readFileSync(PAYLOAD_FILE, 'utf8'));

/** Refuse to submit if messageFlow's quoted consent isn't what the form shows. */
async function consentMatchesLiveForm() {
  const quoted = (payload.messageFlow.match(/reading verbatim: "([^"]+)"/) || [])[1];
  if (!quoted) return { ok: false, why: 'no verbatim consent quote found in messageFlow' };
  try {
    const res = await fetch('https://hyvewyre.com/opt-in/hyvewyre-llc');
    const html = await res.text();
    return html.includes(quoted)
      ? { ok: true }
      : { ok: false, why: 'the consent text in messageFlow does not appear on the live opt-in page' };
  } catch (e) {
    return { ok: false, why: `could not fetch the live opt-in page: ${e.message}` };
  }
}

async function main() {
  if (!key) {
    console.error('TELNYX_API_KEY not set — check .env.local');
    process.exit(1);
  }

  console.log(JSON.stringify(payload, null, 2));

  const consent = await consentMatchesLiveForm();
  console.log('\nconsent text matches the live opt-in form:', consent.ok ? 'yes' : `NO — ${consent.why}`);
  if (!consent.ok && !DRY_RUN) {
    console.error('\nRefusing to submit — fix the mismatch first (this is what attempt 6 was rejected for).');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing submitted.');
    return;
  }

  console.log('\nSubmitting to Telnyx…');
  const res = await fetch('https://api.telnyx.com/10dlc/campaignBuilder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  console.log('HTTP', res.status);
  console.log('campaignId    :', data.campaignId ?? data.id ?? '(none)');
  console.log('status        :', data.campaignStatus ?? data.status ?? '(none)');
  console.log('failureReasons:', JSON.stringify(data.failureReasons ?? null, null, 2));

  if (!res.ok) console.log('RAW:', JSON.stringify(data, null, 2));

  console.log(
    '\nNOTE: a `status` of ACTIVE only means the record was created at TCR. ' +
    'Telnyx\'s own review is separate — check `failureReasons`, which is what the ' +
    'portal shows as "Failed Telnyx Review".'
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
