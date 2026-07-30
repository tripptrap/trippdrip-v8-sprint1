import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

/**
 * Best-effort client IP, most trustworthy source first.
 *
 * On Vercel these are not spoofable. Per Vercel's request-headers docs: it
 * *overwrites* `X-Forwarded-For` and does not forward external IPs, explicitly
 * "to prevent IP spoofing" — so a caller sending its own header does not get a
 * fresh bucket. `x-vercel-forwarded-for` is the same value but survives a proxy
 * running on top of Vercel, which can overwrite `x-forwarded-for`; hence its
 * position above it here.
 *
 * Off Vercel (local dev, another host) these headers are only as trustworthy as
 * whatever proxy sets them. That is a property of the deployment, not of this
 * function.
 */
export function clientIp(req: NextRequest): string | null {
  return (
    req.ip ||
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  );
}

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
};

/**
 * Count one request against `key` and say whether it is allowed (#58).
 *
 * Backed by the `check_rate_limit` RPC rather than a Map in module scope,
 * because serverless instances do not share memory: an in-memory counter gives
 * a caller spread across N warm instances N times the limit, and resets on every
 * cold start. That is exactly the "probe a list at volume" case being defended
 * against, so the counter has to be shared.
 *
 * **Fails open**, loudly. If the limiter itself is broken, the alternative is
 * locking real users out of a login-support endpoint over an infrastructure
 * problem, which is worse than briefly losing a throttle.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!supabaseAdmin) {
    console.error('checkRateLimit: no service-role client — allowing through unthrottled');
    return { allowed: true, count: 0, retryAfterSeconds: 0 };
  }

  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error(`checkRateLimit: RPC failed for ${key}, allowing through unthrottled:`, error);
    return { allowed: true, count: 0, retryAfterSeconds: 0 };
  }

  const result = data as { allowed?: boolean; count?: number; retry_after_seconds?: number };
  return {
    allowed: result?.allowed !== false,
    count: result?.count ?? 0,
    retryAfterSeconds: result?.retry_after_seconds ?? windowSeconds,
  };
}

/**
 * Rate-limit a request by client IP. Returns `null` when allowed, or the 429 to
 * return as-is:
 *
 *     const limited = await limitByIp(req, 'account-status', 10, 60);
 *     if (limited) return limited;
 *
 * A request with no determinable IP is *not* given a free pass — it shares one
 * bucket. Otherwise stripping the header would be the way around the limit.
 */
export async function limitByIp(
  req: NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const ip = clientIp(req) || 'unknown';
  const { allowed, retryAfterSeconds } = await checkRateLimit(`${scope}:${ip}`, limit, windowSeconds);

  if (allowed) return null;

  console.warn(`⛔ Rate limit hit on ${scope} from ${ip} (${limit}/${windowSeconds}s)`);
  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}
