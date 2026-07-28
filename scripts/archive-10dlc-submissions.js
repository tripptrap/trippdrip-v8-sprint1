#!/usr/bin/env node
/**
 * Snapshot every 10DLC campaign submission from Telnyx into docs/10dlc-submissions/.
 *
 *   node scripts/archive-10dlc-submissions.js
 *   node scripts/archive-10dlc-submissions.js --diff   # also print what changed between attempts
 *
 * Read-only — it never submits anything.
 *
 * Why: Telnyx is the authoritative record of what was actually sent (local
 * payload files drifted almost immediately — docs/10dlc_attempt6_payload.json
 * was named for one attempt but held the payload of another). Re-running this
 * after each submission keeps a diffable history, so "what changed between the
 * one that failed and the one that passed" is answerable.
 *
 * Campaigns are create-only, so each rejection means a new campaign; the
 * archive is how the attempts stay comparable.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const BRAND_ID = '4b20019b-eba4-6bfd-8723-dca9058142e8'; // HyveWyre LLC, VERIFIED
const OUT_DIR = path.join(__dirname, '..', 'docs', '10dlc-submissions');
const API = 'https://api.telnyx.com';

// Fields that make up the actual submission, in a stable order so diffs are clean.
const PAYLOAD_FIELDS = [
  'brandId', 'usecase', 'subUsecases', 'description', 'messageFlow',
  'sample1', 'sample2', 'sample3', 'sample4', 'sample5',
  'optinKeywords', 'optinMessage', 'optoutKeywords', 'optoutMessage',
  'helpKeywords', 'helpMessage',
  'subscriberOptin', 'subscriberOptout', 'subscriberHelp',
  'numberPool', 'embeddedLink', 'embeddedPhone', 'ageGated', 'directLending',
  'affiliateMarketing', 'privacyPolicyLink', 'termsAndConditionsLink',
];

async function api(pathname) {
  const res = await fetch(API + pathname, {
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${pathname} -> ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * The review outcome. NOTE: `status` is the TCR record lifecycle, not the review
 * result — a campaign the portal shows as "Failed Telnyx Review" still reports
 * status ACTIVE. `failureReasons` is the field that actually tells you.
 */
function outcomeOf(c) {
  const reasons = (c.failureReasons || [])
    .map((f) => (typeof f === 'string' ? f : f.description))
    .filter(Boolean);
  if (reasons.length) return { outcome: 'FAILED_TELNYX_REVIEW', reasons };

  // No TCR id yet (Telnyx echoes the campaign id in its place) means the
  // campaign hasn't been registered with TCR. On a fresh submission that's
  // simply "in flight" — a genuine TCR failure carries a failureReason and is
  // caught above (attempt 4's "LOW_VOLUME requires minimum of 1 sub-usecases").
  if (!c.tcrCampaignId || c.tcrCampaignId === c.campaignId) {
    return { outcome: 'AWAITING_REVIEW', reasons: [] };
  }
  return { outcome: c.status === 'ACTIVE' ? 'PASSED_REVIEW' : `PENDING (${c.status})`, reasons: [] };
}

async function main() {
  if (!process.env.TELNYX_API_KEY) {
    console.error('TELNYX_API_KEY not set — check .env.local');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const list = await api(`/10dlc/campaign?brandId=${BRAND_ID}&page=1&recordsPerPage=100`);
  const listed = list.records || list.data || [];

  // The brand list lags — a campaign submitted minutes ago is fetchable by id
  // but absent from the listing, which would silently drop the newest (and most
  // interesting) attempt. So union the listing with every id already archived,
  // plus any passed on the command line, and fetch each directly.
  const ids = new Set(listed.map((c) => c.campaignId));

  for (const f of fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : []) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    try {
      const prior = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
      if (prior.campaignId) ids.add(prior.campaignId);
    } catch { /* ignore unreadable archive entries */ }
  }

  for (const arg of process.argv.slice(2)) {
    if (/^[0-9a-f-]{20,}$/i.test(arg)) ids.add(arg);
  }

  const records = [];
  for (const id of ids) {
    try {
      records.push(await api(`/10dlc/campaign/${id}`));
    } catch (e) {
      console.error(`  could not fetch ${id}: ${e.message.slice(0, 80)}`);
    }
  }
  records.sort((a, b) => String(a.createDate).localeCompare(String(b.createDate)));

  if (records.length > listed.length) {
    console.log(`(${records.length - listed.length} campaign(s) fetched by id — not yet in the brand listing)\n`);
  }

  const index = [];

  for (let i = 0; i < records.length; i++) {
    const full = records[i];
    const { outcome, reasons } = outcomeOf(full);

    const payload = {};
    for (const f of PAYLOAD_FIELDS) if (full[f] !== undefined) payload[f] = full[f];

    const attempt = i + 1;
    const date = String(full.createDate || '').slice(0, 10);
    const file = `${String(attempt).padStart(2, '0')}-${date}-${full.campaignId.slice(0, 8)}.json`;

    fs.writeFileSync(
      path.join(OUT_DIR, file),
      JSON.stringify(
        { attempt, campaignId: full.campaignId, tcrCampaignId: full.tcrCampaignId,
          createDate: full.createDate, outcome, failureReasons: reasons, payload },
        null, 2
      ) + '\n'
    );

    index.push({ attempt, file, date, campaignId: full.campaignId, outcome, reasonCount: reasons.length });
    console.log(`${String(attempt).padStart(2)}  ${date}  ${outcome.padEnd(22)} ${reasons.length} reason(s)  -> ${file}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`\narchived ${records.length} submissions to docs/10dlc-submissions/`);

  if (process.argv.includes('--diff') && records.length > 1) {
    console.log('\nFIELD CHANGES BETWEEN CONSECUTIVE ATTEMPTS');
    const files = index.map((e) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, e.file), 'utf8')));
    for (let i = 1; i < files.length; i++) {
      const a = files[i - 1], b = files[i];
      const changed = PAYLOAD_FIELDS.filter(
        (f) => JSON.stringify(a.payload[f] ?? null) !== JSON.stringify(b.payload[f] ?? null)
      );
      console.log(`\n  #${a.attempt} -> #${b.attempt}   (${a.outcome} -> ${b.outcome})`);
      console.log(changed.length ? '    changed: ' + changed.join(', ') : '    (payload identical)');
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
