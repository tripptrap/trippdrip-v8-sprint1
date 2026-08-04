/**
 * Reconcile historical message status against Telnyx.
 *
 * Why this exists: the delivery webhook never handled `message.finalized`, which
 * is the event Telnyx v2 sends for a terminal outcome (#135, fixed in bebbef9).
 * So every delivery result was dropped and 62 outbound rows sat at 'sent'
 * forever, with not one 'delivered' or 'failed' ever recorded.
 *
 * The messages were fine — asking Telnyx about those same ids returns
 * `delivered`. Only our record of them was wrong. This asks Telnyx for the truth
 * and writes it back.
 *
 * One-time by nature, but safe to re-run: it only touches rows that are still in
 * a non-terminal state, and it is idempotent.
 *
 * Usage:
 *   npx tsx scripts/backfill-delivery-status.ts          # dry run, changes nothing
 *   npx tsx scripts/backfill-delivery-status.ts --apply  # writes
 */

import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

/**
 * Same mapping the webhook uses (app/api/telnyx/sms-webhook/route.ts).
 *
 * Deliberately duplicated rather than imported: this is a one-off correction of
 * historical data and must keep producing the same answer even if the live
 * handler is changed later. Values are constrained by messages_status_check to
 * draft|queued|sent|delivered|failed|read, so nothing outside that set is
 * emitted — a value outside it is rejected by Postgres and supabase-js reports
 * it via { error } rather than throwing.
 */
function mapStatus(telnyxStatus: string): 'delivered' | 'failed' | 'sent' {
  const s = (telnyxStatus || '').toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'delivery_failed' || s === 'sending_failed') return 'failed';
  return 'sent';
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const telnyxKey = process.env.TELNYX_API_KEY?.trim();
  if (!url || !key || !telnyxKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or TELNYX_API_KEY');
    process.exit(1);
  }
  const sb = createClient(url, key);

  const { data: rows, error } = await sb
    .from('messages')
    .select('id, message_sid, status, created_at')
    .eq('direction', 'outbound')
    .in('status', ['sent', 'queued'])
    .not('message_sid', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Could not read messages:', error);
    process.exit(1);
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${rows?.length ?? 0} candidate rows\n`);

  const tally: Record<string, number> = {};
  let changed = 0;
  let unknown = 0;

  for (const row of rows || []) {
    const sid = row.message_sid as string;

    // Telnyx ids are UUIDs. Test fixtures and locally-generated placeholders are
    // not, and asking Telnyx about them just wastes a round trip.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
      tally['skipped: not a telnyx id'] = (tally['skipped: not a telnyx id'] || 0) + 1;
      continue;
    }

    let payload: any;
    try {
      const res = await fetch(`https://api.telnyx.com/v2/messages/${sid}`, {
        headers: { Authorization: `Bearer ${telnyxKey}` },
      });
      if (res.status === 404) {
        tally['telnyx: no record'] = (tally['telnyx: no record'] || 0) + 1;
        unknown++;
        continue;
      }
      if (!res.ok) {
        tally[`telnyx: HTTP ${res.status}`] = (tally[`telnyx: HTTP ${res.status}`] || 0) + 1;
        unknown++;
        continue;
      }
      payload = (await res.json())?.data;
    } catch (e: any) {
      tally['telnyx: request failed'] = (tally['telnyx: request failed'] || 0) + 1;
      unknown++;
      continue;
    }

    const recipient = payload?.to?.[0];
    const telnyxStatus = String(recipient?.status || '');
    if (!telnyxStatus) {
      tally['telnyx: no recipient status'] = (tally['telnyx: no recipient status'] || 0) + 1;
      unknown++;
      continue;
    }

    const next = mapStatus(telnyxStatus);
    tally[`telnyx says ${telnyxStatus} -> ${next}`] =
      (tally[`telnyx says ${telnyxStatus} -> ${next}`] || 0) + 1;

    if (next === row.status) continue;

    const err = payload?.errors?.[0];
    changed++;

    if (APPLY) {
      const { error: upErr } = await sb
        .from('messages')
        .update({
          status: next,
          error_code: next === 'failed' ? (err?.code ? String(err.code) : null) : null,
          error_message: next === 'failed' ? (err?.detail || err?.title || null) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      // supabase-js returns { error }; it does not throw.
      if (upErr) console.error(`  update failed for ${sid}:`, upErr.message);
    }
  }

  console.log('Telnyx said:');
  for (const [k, v] of Object.entries(tally).sort()) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log(`\n${changed} row(s) ${APPLY ? 'updated' : 'would change'}, ${unknown} unresolved.`);
  if (!APPLY && changed) console.log('Re-run with --apply to write.');
}

main();
