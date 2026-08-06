// Authenticate a request from either a browser session or a Bearer token.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// The browser extension sends `Authorization: Bearer <token>` to every endpoint
// it uses — /api/leads/list, /api/leads/import, /api/sms/send and the two AI
// routes. Every one of those authenticates with `supabase.auth.getUser()` built
// by `createClient()`, which reads **cookies** and ignores the Authorization
// header entirely.
//
// A server-to-server request carries no cookies, so the extension was answered
// 401 by everything. Verified against the running app with a real, valid Supabase
// access token in the header and cookies omitted: 401 "Not authenticated". The
// extension has never worked — not the lead list, not import, not send, and not
// the two AI features that #147 was filed about. Two missing routes were the
// symptom; this was the disease.
//
// ── What a token is here ────────────────────────────────────────────────────
//
// A Supabase **access token**, verified by asking Supabase who it belongs to.
// That is the ordinary pattern for a non-browser client, and it is safe: the
// token is signed by the auth server, `getUser(jwt)` validates it there, and an
// expired or forged one resolves to nobody.
//
// It is NOT a durable API key. Access tokens expire in about an hour, and the
// extension stores its value in chrome.storage.sync indefinitely, so a user will
// have to re-paste it. Making that pleasant needs a real api_keys table with
// hashed, revocable, non-expiring keys and a settings screen to mint them —
// filed separately. This closes the gap between "nothing works" and that.

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export interface AuthenticatedCaller {
  /** The verified user id. Never taken from the request body. */
  id: string;
  email: string | null;
  /** How they proved it — useful in logs when a client misbehaves. */
  via: 'session' | 'bearer';
}

/**
 * Resolve the caller, cookie session first, then Bearer token.
 *
 * @returns the caller, or null if neither proves an identity. Callers must treat
 *          null as 401 — never as "anonymous but allowed".
 */
export async function authenticateRequest(
  // Plain `Request`, not NextRequest: this only reads a header, and some route
  // handlers in this codebase are typed with the Web `Request`. NextRequest
  // extends it, so every caller still satisfies this.
  req: Request
): Promise<AuthenticatedCaller | null> {
  // 1. Browser session. Tried first so the dashboard's own behaviour is
  //    completely unchanged by this helper.
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { id: user.id, email: user.email ?? null, via: 'session' };
  } catch {
    // No cookie store (a non-request context) — fall through to the header.
  }

  // 2. Bearer token, for the extension and anything else without cookies.
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  // A bare anon-key client purely to verify the token. It carries no session of
  // its own, so the only identity in play is the one the token proves.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // supabase-js returns { error }; it does not throw. An expired or forged token
  // lands here as an error, which must read as "not authenticated" and never as
  // a pass.
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user) return null;

  return { id: data.user.id, email: data.user.email ?? null, via: 'bearer' };
}
