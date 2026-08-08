/**
 * Fails when a route writes a column of `public.users` that its client is not
 * granted.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `authenticated` holds column-level UPDATE on `public.users` for a handful of
 * columns and nothing else. A write to any other column through the user's
 * client fails with `permission denied for table users` — at runtime, in
 * production, on a path nobody tests.
 *
 * That has now happened seven times. The last one (#195) meant no part of
 * onboarding state was ever saved: the theme picker and product tour reappeared
 * on every page load for every user, for months, because the UI applied the
 * change optimistically and only adopted the server's reply on success. A failed
 * write looked exactly like a successful one until you reloaded.
 *
 * Finding the eighth by hand is not a plan.
 *
 * ── What it checks ─────────────────────────────────────────────────────────
 *
 * For every `.from('users').update({...})` / `.upsert({...})`:
 *   1. resolve the client variable back to how it was created in that file;
 *   2. if it is service-role, allow it — that client bypasses RLS and grants;
 *   3. otherwise, require every column in the payload to be in the granted set.
 *
 * The granted set is read from the live database so it cannot go stale, with a
 * documented fallback when there are no credentials (CI without secrets).
 *
 * ── What it does not catch ─────────────────────────────────────────────────
 *
 * This is a text scan, not a type checker. A client passed into a helper, or a
 * column name built at runtime, is invisible to it — those are reported as
 * UNKNOWN rather than silently passed, because "I could not tell" and "it is
 * fine" are different answers.
 *
 * Run: npx tsx scripts/check-user-writes.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'lib'];

/**
 * Fallback used only when the database cannot be reached. Kept accurate as of
 * 2026-08-08; the live query below is the real source.
 */
const FALLBACK_GRANTED = ['business_hours', 'business_name', 'timezone', 'updated_at'];

type Finding = {
  file: string;
  line: number;
  level: 'FAIL' | 'UNKNOWN';
  client: string;
  detail: string;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * How a client variable was created, judged from its assignment in the same file.
 *
 * A bare `createClient(url, key)` counts as service-role only when the key it is
 * handed is the service-role one — that is the shape several routes use instead
 * of the shared helper, and it is genuinely privileged.
 */
function classifyClient(src: string, name: string): 'service' | 'user' | 'unknown' {
  const assign = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*([\\s\\S]{0,220})`,
  );
  const m = src.match(assign);
  if (!m) return 'unknown';
  const rhs = m[1];

  if (/createServiceRoleClient\s*\(/.test(rhs)) return 'service';
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(rhs)) return 'service';
  // Several routes read the service key into a local first, so the env var name
  // never appears at the call site. Matching only the literal marked five
  // legitimately-privileged writes as UNKNOWN, which trains people to ignore the
  // category.
  if (/\b\w*(?:service[_-]?role|service[_-]?key|admin[_-]?key)\w*\b/i.test(rhs)) return 'service';
  if (/createClient\s*\(\s*\)|await\s+createClient\s*\(/.test(rhs)) return 'user';
  if (/createRouteHandlerClient|createServerComponentClient|createBrowserClient/.test(rhs)) return 'user';
  if (/createClient\s*\(/.test(rhs)) return 'unknown';
  return 'unknown';
}

/** Column names from an inline object literal, or null when it is not one. */
function columnsFrom(payload: string): string[] | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith('{')) return null; // spread, variable, or call — cannot tell
  let depth = 0;
  let body = '';
  for (const ch of trimmed) {
    if (ch === '{') depth++;
    if (depth >= 1) body += ch;
    if (ch === '}') { depth--; if (depth === 0) break; }
  }
  if (/\.\.\./.test(body)) return null; // spread hides keys
  const keys = [...body.matchAll(/(?:^|[{,])\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))\s*:/g)]
    .map(m => m[1] ?? m[2] ?? m[3]);
  return keys.length ? keys : null;
}

/**
 * The grants, from the catalog.
 *
 * `information_schema` is not reachable over PostgREST, so this goes through
 * `health_catalog_checks()` — the same SECURITY DEFINER function `npm run health`
 * uses, extended to report this. Reading it live matters: a hardcoded list here
 * would be a second source of truth that drifts from the grants it exists to
 * enforce, which is the failure mode this whole check is about.
 */
async function grantedColumns(): Promise<{ cols: string[] | 'ALL'; source: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { cols: FALLBACK_GRANTED, source: 'fallback — no DB credentials in env' };

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(url, key);
    const { data, error } = await sb.rpc('health_catalog_checks');
    if (error) return { cols: FALLBACK_GRANTED, source: `fallback — RPC failed: ${error.message}` };

    const raw = (data as any)?.users_authenticated_update_cols;
    if (raw === 'ALL') return { cols: 'ALL', source: 'live catalog' };
    if (Array.isArray(raw)) return { cols: raw, source: 'live catalog' };
    return { cols: FALLBACK_GRANTED, source: 'fallback — RPC did not report the grant' };
  } catch (err: any) {
    return { cols: FALLBACK_GRANTED, source: `fallback — ${err?.message ?? 'lookup failed'}` };
  }
}

async function main() {
  const { cols: granted, source } = await grantedColumns();
  // A table-wide UPDATE grant means every column is writable and this check has
  // nothing to enforce — but that is itself worth saying out loud rather than
  // passing silently, since it would be a significant loosening.
  const grantAll = granted === 'ALL';
  const grantedSet = new Set(grantAll ? [] : (granted as string[]));

  const files = SCAN_DIRS
    .filter(d => { try { return statSync(join(ROOT, d)).isDirectory(); } catch { return false; } })
    .flatMap(d => walk(join(ROOT, d)));

  const findings: Finding[] = [];
  let writesChecked = 0;

  // Client variable, then .from('users'), then the write and its payload —
  // across newlines, because that is how these are actually formatted.
  const WRITE = /(\w+)\s*(?:\r?\n\s*)?\.from\(\s*['"]users['"]\s*\)\s*(?:\r?\n\s*)?\.(update|upsert)\s*\(([\s\S]{0,400})/g;

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes("from('users')") && !src.includes('from("users")')) continue;

    for (const m of src.matchAll(WRITE)) {
      writesChecked++;
      const [, clientVar, , payload] = m;
      const line = src.slice(0, m.index!).split('\n').length;
      const rel = relative(ROOT, file);

      const kind = classifyClient(src, clientVar);
      if (kind === 'service') continue;

      const cols = columnsFrom(payload);
      if (!cols) {
        findings.push({
          file: rel, line, level: 'UNKNOWN', client: clientVar,
          detail: `${kind} client, payload is not an inline object — columns cannot be read`,
        });
        continue;
      }

      const ungranted = grantAll ? [] : cols.filter(c => !grantedSet.has(c));
      if (kind === 'unknown' && ungranted.length === 0) continue;

      if (ungranted.length > 0) {
        findings.push({
          file: rel, line,
          level: kind === 'user' ? 'FAIL' : 'UNKNOWN',
          client: clientVar,
          detail: `writes ${ungranted.map(c => `\`${c}\``).join(', ')} — not granted to \`authenticated\``,
        });
      }
    }
  }

  const fails = findings.filter(f => f.level === 'FAIL');
  const unknowns = findings.filter(f => f.level === 'UNKNOWN');

  console.log('');
  console.log(`  public.users write check — ${writesChecked} write(s) across ${files.length} files`);
  console.log(`  granted to authenticated: ${grantAll ? 'ALL COLUMNS (table-wide UPDATE)' : (granted as string[]).join(', ')}`);
  console.log(`  source: ${source}`);
  console.log('');

  for (const f of fails) {
    console.log(`   FAIL  ${f.file}:${f.line}`);
    console.log(`         via \`${f.client}\` (user client) — ${f.detail}`);
    console.log(`         → use createServiceRoleClient(), scoped with .eq('id', user.id)`);
  }
  for (const f of unknowns) {
    console.log(`   ?     ${f.file}:${f.line}  via \`${f.client}\` — ${f.detail}`);
  }

  if (!fails.length && !unknowns.length) {
    console.log('   ok   every write to public.users uses a client that is allowed to make it');
  }
  console.log('');
  console.log(`  ${fails.length} failing, ${unknowns.length} needing a human`);
  console.log('');

  process.exit(fails.length ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
