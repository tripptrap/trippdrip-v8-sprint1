#!/usr/bin/env node
/**
 * Create the full HyveWyre product catalog in a Stripe account.
 *
 *   node scripts/provision-stripe-catalog.js                  # dry run (default)
 *   node scripts/provision-stripe-catalog.js --apply --yes     # actually create
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/provision-stripe-catalog.js
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Production runs an `sk_test_` key against the "TriDrip sandbox" account
 * (#81). A Stripe Sandbox has no live mode, so live prices cannot be created in
 * it — the catalog has to be rebuilt in the real account, and all eleven
 * STRIPE_PRICE_* env vars repointed in the same change (#63). Miss that and
 * checkout falls back to sandbox price ids that don't exist live, breaking it
 * for every customer.
 *
 * Doing that by hand is twelve dashboard forms and eleven ids copied by eye.
 * This does it from lib/pointPacks.ts — the same source /points, Settings and
 * the auto-refill picker read — so the prices cannot disagree with the app.
 *
 * It also fixes the naming while rebuilding: the sandbox products say
 * "(Basic)" / "(Premium)" and "HyveWyre Basic Plan", which customers see on
 * checkout, receipts and invoices even though the app says Growth/Scale (#82).
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 *
 * - Dry run unless BOTH --apply and --yes are passed.
 * - Only ever CREATES. Never deletes, archives or edits an existing price;
 *   Stripe prices are immutable anyway, so a wrong amount means creating a new
 *   one and repointing, not editing.
 * - Idempotent: each product and price carries a `hyvewyre_key` in metadata and
 *   is reused if already present with the right amount.
 * - Prints the env block to paste into Vercel, then tells you to verify with
 *   scripts/audit-stripe-prices.js against the same key.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply') && process.argv.includes('--yes');
const WANTED_APPLY = process.argv.includes('--apply');

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
  console.error('STRIPE_SECRET_KEY is not set. Pass the target account\'s key:');
  console.error('  STRIPE_SECRET_KEY=sk_live_... node scripts/provision-stripe-catalog.js');
  process.exit(2);
}
const Stripe = require('stripe');
const stripe = new Stripe(key);

// Parsed from the source rather than duplicated — duplicating the numbers in
// the provisioner would defeat having one catalog.
function loadPacks() {
  const src = fs.readFileSync(path.join(ROOT, 'lib/pointPacks.ts'), 'utf8');
  const start = src.indexOf('export const POINT_PACKS');
  const block = src.slice(start, src.indexOf('];', start));
  const packs = [];
  const re = /name:\s*'([^']+)',\s*points:\s*(\d+),\s*basePrice:\s*([\d.]+),\s*premiumPrice:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(block))) {
    packs.push({ name: m[1], points: +m[2], growth: +m[3], scale: +m[4] });
  }
  if (!packs.length) throw new Error('Could not parse POINT_PACKS from lib/pointPacks.ts');
  return packs;
}

/** Everything the app charges for, with the env var each price id belongs in. */
function buildPlan() {
  const items = [];

  // Subscriptions. Amounts from CLAUDE.md: Growth $30/mo, Scale $98/mo.
  items.push({
    key: 'plan_growth', envVar: 'STRIPE_PRICE_GROWTH',
    product: 'HyveWyre Growth Plan',
    description: '3,000 credits per month',
    amount: 30, recurring: 'month',
  });
  items.push({
    key: 'plan_scale', envVar: 'STRIPE_PRICE_SCALE',
    product: 'HyveWyre Scale Plan',
    description: '10,000 credits per month, plus discounted credit packs',
    amount: 98, recurring: 'month',
  });

  // Point packs, one product per tier so the customer sees which price applies.
  // Named "(Growth)" / "(Scale)" — the sandbox says "(Basic)" / "(Premium)",
  // which is what customers currently read on receipts (#82).
  for (const pack of loadPacks()) {
    for (const tier of ['growth', 'scale']) {
      const Tier = tier === 'growth' ? 'Growth' : 'Scale';
      items.push({
        key: `pack_${tier}_${pack.name.toLowerCase()}`,
        envVar: `STRIPE_PRICE_PACK_${tier.toUpperCase()}_${pack.name.toUpperCase()}`,
        product: `${pack.name} (${Tier})`,
        description: `${pack.points.toLocaleString()} credits`,
        amount: pack[tier], recurring: null,
      });
    }
  }

  items.push({
    key: 'phone_number', envVar: 'STRIPE_PHONE_NUMBER_PRICE_ID',
    product: 'Additional Phone Number',
    description: 'One additional phone number, billed monthly',
    amount: 1, recurring: 'month',
  });

  return items;
}

async function findProduct(hyvewyreKey) {
  // Stripe has no metadata filter on product list, so scan actives. The catalog
  // is a dozen items; this stays cheap.
  const products = await stripe.products.list({ limit: 100, active: true });
  return products.data.find((p) => p.metadata && p.metadata.hyvewyre_key === hyvewyreKey) || null;
}

async function findPrice(productId, amountCents, recurring) {
  const prices = await stripe.prices.list({ product: productId, limit: 100, active: true });
  return prices.data.find((p) =>
    p.unit_amount === amountCents &&
    p.currency === 'usd' &&
    (recurring ? p.recurring && p.recurring.interval === recurring : !p.recurring)
  ) || null;
}

(async () => {
  const mode = key.startsWith('sk_live') ? 'LIVE' : 'TEST';
  const account = await stripe.accounts.retrieve();
  const plan = buildPlan();

  console.log(`Target account: ${account.id} — ${account.settings?.dashboard?.display_name || 'unnamed'}`);
  console.log(`Key mode:       ${mode}`);
  console.log(`Catalog:        ${plan.length} products/prices from lib/pointPacks.ts\n`);

  if (!APPLY) {
    console.log(WANTED_APPLY
      ? '⚠️  --apply given without --yes. Nothing will be created.\n'
      : 'DRY RUN — nothing will be created. Re-run with --apply --yes to create.\n');
  }

  const envLines = [];
  let created = 0, reused = 0;

  for (const item of plan) {
    const cents = Math.round(item.amount * 100);
    const label = `${item.product} $${item.amount.toFixed(2)}${item.recurring ? '/' + item.recurring : ''}`;

    if (!APPLY) {
      const existing = await findProduct(item.key);
      const price = existing ? await findPrice(existing.id, cents, item.recurring) : null;
      console.log(`  ${price ? 'reuse ' : 'create'}  ${label.padEnd(52)} ${item.envVar}`);
      if (price) envLines.push(`${item.envVar}=${price.id}`);
      continue;
    }

    let product = await findProduct(item.key);
    if (!product) {
      product = await stripe.products.create({
        name: item.product,
        description: item.description,
        metadata: { hyvewyre_key: item.key },
      });
    }

    let price = await findPrice(product.id, cents, item.recurring);
    if (price) {
      reused++;
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: cents,
        currency: 'usd',
        ...(item.recurring ? { recurring: { interval: item.recurring } } : {}),
        metadata: { hyvewyre_key: item.key },
      });
      created++;
    }
    console.log(`  ${price ? 'ok    ' : 'fail  '}  ${label.padEnd(52)} ${price.id}`);
    envLines.push(`${item.envVar}=${price.id}`);
  }

  console.log('');
  if (APPLY) console.log(`Created ${created} price(s), reused ${reused}.\n`);

  if (envLines.length === plan.length) {
    console.log('── Set these in Vercel (Production), then redeploy ──────────────');
    for (const l of envLines) console.log(l);
    console.log('');
    console.log('Then verify against the SAME key before any real traffic:');
    console.log('  node scripts/audit-stripe-prices.js');
    console.log('');
    console.log('Remaining manual steps this script does NOT do:');
    console.log('  - STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    console.log('  - register the webhook endpoint and set STRIPE_WEBHOOK_SECRET');
    console.log('  - decide what to do with existing users\' sandbox');
    console.log('    stripe_customer_id / stripe_subscription_id (see #81)');
  } else if (!APPLY) {
    console.log('(env block printed only when every price already exists — run with --apply --yes)');
  }
})().catch((e) => { console.error('provision failed:', e.message); process.exit(1); });
