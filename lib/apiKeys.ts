// Minting and verifying durable API keys. (#148)
//
// The extension needs a credential that does not expire an hour after the user
// pastes it. A Supabase access token does exactly that (#147), which meant the
// extension worked briefly and then silently fell back to canned text.
//
// The key is shown once. Only sha256(key) is stored, so the table is useless to
// anyone who reads it — see supabase/migrations/api_keys_for_the_extension.sql
// for why SHA-256 rather than a slow password hash.

import crypto from 'crypto';

/**
 * Namespace so a key is recognisable on sight — in a bug report, a log, a
 * committed .env someone is about to regret. `live` leaves room for a `test`
 * namespace later without changing the parser.
 */
export const API_KEY_PREFIX = 'hyve_live_';

/** Characters of the full key kept in the clear, for display only. */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export interface GeneratedApiKey {
  /** The full secret. Returned to the caller ONCE and never stored. */
  key: string;
  /** What goes in api_keys.key_hash. */
  keyHash: string;
  /** What goes in api_keys.key_prefix — safe to show, not a credential. */
  keyPrefix: string;
}

/**
 * Mint a new key.
 *
 * 32 bytes from the CSPRNG — 256 bits — rendered base64url so it survives being
 * pasted into a header, a form field, or a shell without escaping.
 */
export function generateApiKey(): GeneratedApiKey {
  const secret = crypto.randomBytes(32).toString('base64url');
  const key = `${API_KEY_PREFIX}${secret}`;
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

/** sha256, lowercase hex — the format the CHECK constraint enforces. */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Cheap shape test, so a Supabase access token is not hashed and looked up. */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/**
 * Resolve a key to its owner, or null.
 *
 * Takes the service-role client as an argument rather than building one, so the
 * caller owns that decision and this stays trivially testable.
 *
 * `last_used_at` is updated on the way out and its failure is ignored: it is
 * telemetry, and a write error there must never turn a valid key into a 401.
 */
export async function resolveApiKey(
  admin: { from: (t: string) => any },
  presentedKey: string
): Promise<{ userId: string; keyId: string } | null> {
  if (!looksLikeApiKey(presentedKey)) return null;

  // One indexed equality lookup on the hash. Never a scan over candidate rows,
  // so the work done does not depend on how many keys exist.
  const { data, error } = await admin
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', hashApiKey(presentedKey))
    .is('revoked_at', null)
    .maybeSingle();

  // supabase-js returns { error }; it does not throw. A read failure must read as
  // "not authenticated", never as a pass.
  if (error || !data) return null;

  void admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then?.(() => {}, () => {});

  return { userId: data.user_id, keyId: data.id };
}
