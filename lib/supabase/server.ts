import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Service role client for admin operations (e.g., deleting users)
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        // ── Next.js caches these reads, and it is very hard to see ───────────
        //
        // A supabase-js SELECT is an HTTP GET, and Next patches global fetch so
        // GETs are cached by default. A route handler therefore keeps serving the
        // FIRST response it ever got for a given query, for as long as the server
        // lives. `export const dynamic = 'force-dynamic'` does NOT save you — the
        // idle-campaign cron had it and still read stale rows.
        //
        // Caught on 2026-08-05 while testing that cron: it kept reporting
        // idle_warned_at as null after the column had been written, PostgREST
        // returned the real value to curl and to a fresh Node process, and adding
        // one column to the .select() — a different cache key — made the same code
        // work immediately. That is a cache, not a query bug.
        //
        // The failure mode is nasty precisely because it is invisible: no error,
        // no warning, just a job acting on the world as it was the first time it
        // looked. For crons that decide whether to charge, send or deactivate,
        // that is the difference between correct and dangerous.
        //
        // Every read through this client is now explicitly uncached. Writes are
        // unaffected (POST/PATCH were never cached).
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, cache: 'no-store' as RequestCache }),
      },
    }
  )
}
