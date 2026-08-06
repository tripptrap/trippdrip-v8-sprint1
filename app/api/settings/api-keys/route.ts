// API Route: mint, list and revoke API keys. (#148)
//
// The key is returned exactly once, from POST. There is no endpoint that can
// read it back, because only sha256(key) is stored — losing it means minting a
// new one and revoking the old.
//
// Every handler verifies the session and then acts as service_role: `api_keys`
// has no client-side grants at all, the same posture as the points ledger
// (#144). That also means key_hash can never reach a browser.
//
// Session only, deliberately — `authenticateRequest` is not used here. A key
// must not be able to mint another key or revoke its siblings; escalating from
// a leaked extension credential to permanent account access is exactly what
// revocation is supposed to prevent.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateApiKey } from '@/lib/apiKeys';

export const dynamic = 'force-dynamic';

/** A cap, so a runaway client cannot fill the table. Revoked keys do not count. */
const MAX_ACTIVE_KEYS = 10;

async function requireSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** GET — list this account's keys. Never includes the key or its hash. */
export async function GET() {
  try {
    const user = await requireSession();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { data, error } = await createServiceRoleClient()
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('api-keys: list failed:', error);
      return NextResponse.json({ ok: false, error: 'Could not load API keys' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, keys: data ?? [] });
  } catch (error: any) {
    console.error('api-keys GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/** POST — mint a key. The only time its value is ever returned. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim().slice(0, 60) || 'Browser extension';

    const admin = createServiceRoleClient();

    const { count, error: countError } = await admin
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('revoked_at', null);

    if (countError) {
      console.error('api-keys: could not count existing keys:', countError);
      return NextResponse.json({ ok: false, error: 'Could not create API key' }, { status: 500 });
    }

    if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
      return NextResponse.json(
        { ok: false, error: `You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` },
        { status: 400 }
      );
    }

    const { key, keyHash, keyPrefix } = generateApiKey();

    const { data, error } = await admin
      .from('api_keys')
      .insert({ user_id: user.id, key_hash: keyHash, key_prefix: keyPrefix, name })
      .select('id, name, key_prefix, created_at')
      .single();

    // supabase-js returns { error }; it does not throw. Reporting a key that was
    // never stored would hand the user a credential that can never authenticate.
    if (error || !data) {
      console.error('api-keys: insert failed:', error);
      return NextResponse.json({ ok: false, error: 'Could not create API key' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      // Shown once. Not retrievable afterwards by any route, including this one.
      key,
      keyRecord: data,
    });
  } catch (error: any) {
    console.error('api-keys POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/** DELETE — revoke. The row is kept so revocation stays auditable. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireSession();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const id = new URL(req.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });
    }

    // `.eq('user_id', user.id)` is the ownership check — without it an id from
    // another account would revoke that account's key. `.select()` so a
    // no-rows-matched result is distinguishable from a success (#115).
    const { data, error } = await createServiceRoleClient()
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .select('id');

    if (error) {
      console.error('api-keys: revoke failed:', error);
      return NextResponse.json({ ok: false, error: 'Could not revoke API key' }, { status: 500 });
    }

    if (!data?.length) {
      return NextResponse.json(
        { ok: false, error: 'Key not found, or already revoked' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, revoked: id });
  } catch (error: any) {
    console.error('api-keys DELETE error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
