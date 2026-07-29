#!/usr/bin/env node
/**
 * Check that every Stripe price matches lib/pointPacks.ts.
 *
 *   node scripts/audit-stripe-prices.js
 *
 * Exits non-zero on any mismatch, so it can gate a deploy.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Pack pricing was defined in five different places at once (#39, #76, #77):
 * the /points page constant, subscriptionFeatures.pointPackDiscount, the
 * auto-buy cron's private table, the Settings Credit Packs table, and an
 * "estimated cost" of points x $0.01. For 10,000 points those disagreed four
 * ways — $100, $95, $85 and $59.50 — depending on which surface you read.
 * All of them now derive from lib/pointPacks.ts.
 *
 * Stripe is the one source that CAN'T be made to derive from it, because the
 * amount lives in Stripe and prices there are immutable — you cannot edit an
 * amount, only create a new price and repoint the env var. So Stripe is the
 * remaining place the catalog can silently drift from what customers are
 * actually charged, and the only defence is to check.
 *
 * A mismatch here means the app advertises one price and Stripe charges
 * another. Run it after changing lib/pointPacks.ts, and before and after
 * switching to live-mode keys (#63).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

for (const file of ['.env.local', '.env']) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const key = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim();
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set — cannot audit prices.');
  process.exit(2);
}
const Stripe = require('stripe');
const stripe = new Stripe(key);

// Parsed out of lib/pointPacks.ts rather than duplicated here. Duplicating the
// numbers in the checker would defeat the point of having one source.
function loadCatalog() {
  const src = fs.readFileSync(path.join(ROOT, 'lib/pointPacks.ts'), 'utf8');
  const block = src.slice(src.indexOf('export const POINT_PACKS'), src.indexOf('];', src.indexOf('export const POINT_PACKS')));
  const packs = [];
  const re = /name:\s*'([^']+)',\s*points:\s*(\d+),\s*basePrice:\s*([\d.]+),\s*premiumPrice:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(block))) {
    packs.push({ name: m[1], points: +m[2], growth: +m[3], scale: +m[4] });
  }
  if (packs.length === 0) throw new Error('Could not parse POINT_PACKS from lib/pointPacks.ts');
  return packs;
}

// Must stay in step with the fallbacks in app/api/stripe/create-checkout/route.ts.
const PACK_PRICE_IDS = {
  growth: {
    Starter: process.env.STRIPE_PRICE_PACK_GROWTH_STARTER || 'price_1SQtbMFyk0lZUopFleqbdgVZ',
    Pro: process.env.STRIPE_PRICE_PACK_GROWTH_PRO || 'price_1SQtbuFyk0lZUopFbBFafou0',
    Business: process.env.STRIPE_PRICE_PACK_GROWTH_BUSINESS || 'price_1SQtciFyk0lZUopFP2ATsGyR',
    Enterprise: process.env.STRIPE_PRICE_PACK_GROWTH_ENTERPRISE || 'price_1SQtdJFyk0lZUopFuSaGfzU3',
  },
  scale: {
    Starter: process.env.STRIPE_PRICE_PACK_SCALE_STARTER || 'price_1SQtduFyk0lZUopFApnLorDd',
    Pro: process.env.STRIPE_PRICE_PACK_SCALE_PRO || 'price_1SQteQFyk0lZUopF63RURC72',
    Business: process.env.STRIPE_PRICE_PACK_SCALE_BUSINESS || 'price_1TyGHZFyk0lZUopF5ZSER77Y',
    Enterprise: process.env.STRIPE_PRICE_PACK_SCALE_ENTERPRISE || 'price_1TyGHZFyk0lZUopFUlexYwA1',
  },
};

// Plan prices aren't in pointPacks.ts (they're subscriptions, not packs), but
// they're the other thing a customer is charged, so they're checked too.
// Sourced from CLAUDE.md: Growth $30/mo, Scale $98/mo.
const PLAN_PRICES = [
  ['Growth', process.env.STRIPE_PRICE_GROWTH || 'price_1SQtYHFyk0lZUopFNa0lT81K', 30],
  ['Scale', process.env.STRIPE_PRICE_SCALE || 'price_1SQtaUFyk0lZUopFRJnuLftL', 98],
];

async function checkPrice(label, id, expected) {
  let price;
  try {
    price = await stripe.prices.retrieve(id);
  } catch (err) {
    console.log(`  ${label.padEnd(20)} expected $${expected.toFixed(2).padStart(8)}   LOOKUP FAILED: ${err.message}`);
    return false;
  }
  const actual = (price.unit_amount ?? 0) / 100;
  // Compare in cents; floats make 382.50 unreliable under ===.
  const ok = Math.round(actual * 100) === Math.round(expected * 100);
  const flags = [];
  if (!price.active) flags.push('INACTIVE');
  if (price.currency !== 'usd') flags.push(`currency=${price.currency}`);
  console.log(
    `  ${label.padEnd(20)} expected $${expected.toFixed(2).padStart(8)}   stripe $${actual.toFixed(2).padStart(8)}   ` +
      `${ok ? 'ok' : '*** MISMATCH ***'}${flags.length ? '  [' + flags.join(', ') + ']' : ''}`
  );
  return ok && flags.length === 0;
}

/**
 * Every price id the app can charge. Anything active in Stripe but absent from
 * this set is chargeable without appearing anywhere in the code.
 */
function configuredPriceIds() {
  return new Set([
    ...Object.values(PACK_PRICE_IDS.growth),
    ...Object.values(PACK_PRICE_IDS.scale),
    ...PLAN_PRICES.map(([, id]) => id),
    process.env.STRIPE_PHONE_NUMBER_PRICE_ID || 'price_1StXaTFyk0lZUopFFJDEClnd',
  ]);
}

/**
 * Report active prices the app never references.
 *
 * The per-price check above only proves the ids the app *uses* carry the right
 * amount. It says nothing about extras — and because Stripe prices are
 * immutable, every price change leaves the previous one behind, still active
 * and still chargeable, unless it is explicitly archived. This account had two
 * such leftovers ($187.50 on Business Premium, $420 on Enterprise Premium) plus
 * a stray $15 "myproduct", none referenced by any code path.
 *
 * Warning rather than failure: a legitimately unused price isn't wrong, and a
 * check that fails on it would get muted. Archive them in Stripe to silence it.
 */
async function reportUnreferencedPrices(configured) {
  const products = await stripe.products.list({ limit: 100, active: true });
  const strays = [];
  for (const product of products.data) {
    const prices = await stripe.prices.list({ product: product.id, limit: 100 });
    for (const price of prices.data) {
      if (!price.active || configured.has(price.id)) continue;
      strays.push({
        product: product.name,
        amount: (price.unit_amount ?? 0) / 100,
        recurring: price.recurring ? `/${price.recurring.interval}` : ' one-time',
        id: price.id,
      });
    }
  }
  if (strays.length === 0) {
    console.log('no unreferenced active prices');
    return;
  }
  console.log(`⚠️  ${strays.length} active price(s) chargeable but referenced by no code path:`);
  for (const s of strays) {
    console.log(`  ${s.product.padEnd(24)} $${s.amount.toFixed(2).padStart(8)}${s.recurring}   ${s.id}`);
  }
  console.log('  Archive these in Stripe unless something outside this repo needs them.');
}

(async () => {
  const mode = key.startsWith('sk_live') ? 'LIVE' : 'TEST';
  console.log(`Stripe price audit — key mode: ${mode}\n`);

  const catalog = loadCatalog();
  let failures = 0;

  for (const tier of ['growth', 'scale']) {
    console.log(`${tier} pack prices`);
    for (const pack of catalog) {
      const id = PACK_PRICE_IDS[tier][pack.name];
      if (!id) {
        console.log(`  ${pack.name.padEnd(20)} NO PRICE ID CONFIGURED`);
        failures++;
        continue;
      }
      if (!(await checkPrice(`${pack.name} (${pack.points})`, id, pack[tier]))) failures++;
    }
    console.log('');
  }

  console.log('plan prices');
  for (const [label, id, expected] of PLAN_PRICES) {
    if (!(await checkPrice(`${label} /mo`, id, expected))) failures++;
  }

  console.log('');
  await reportUnreferencedPrices(configuredPriceIds());

  console.log('');
  if (failures) {
    console.error(`❌ ${failures} price(s) disagree with lib/pointPacks.ts.`);
    console.error('   Stripe prices are immutable — create a NEW price at the correct amount and');
    console.error('   repoint the corresponding STRIPE_PRICE_* env var. Do not edit the old one.');
    process.exit(1);
  }
  console.log(`✅ All ${catalog.length * 2 + PLAN_PRICES.length} prices match the catalog (${mode} mode).`);
})();
