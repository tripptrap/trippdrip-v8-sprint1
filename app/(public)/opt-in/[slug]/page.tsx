import { createServiceRoleClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buildConsentText } from '@/lib/optInConsent';
import BrandedOptInForm from '@/components/BrandedOptInForm';

export const dynamic = 'force-dynamic';

/**
 * Per-business SMS opt-in page — https://hyvewyre.com/opt-in/<slug>
 *
 * This URL is submitted to Telnyx as consent evidence for that business's
 * 10DLC campaign, so it is deliberately SERVER-RENDERED: a compliance
 * reviewer (or a crawler that doesn't execute JS) must be able to read the
 * business name and the full consent disclaimer straight out of the HTML.
 */

// Service-role client: this page is public, but the users table is RLS-locked.
// Only non-sensitive display fields are ever selected below.
// createServiceRoleClient, not a bare createClient.
//
// This page built its own client, which meant it missed the `cache: 'no-store'`
// fetch that lib/supabase/server puts on the shared one. supabase-js SELECTs are
// HTTP GETs and Next caches them; `export const dynamic = 'force-dynamic'` above
// does NOT prevent it. So this page served whatever business_name it read first,
// for the life of the server.
//
// That is load-bearing here rather than cosmetic: this page is the consent
// evidence a carrier reviewer opens and compares, byte for byte, against the
// messageFlow text in the 10DLC campaign. A stale name on this page is a
// mismatch with the filing, which is a documented rejection cause.
const supabaseAdmin = createServiceRoleClient();

async function getBusiness(slug: string) {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, business_name, opt_in_slug')
    .eq('opt_in_slug', slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const name = business?.business_name || 'Business';
  return {
    title: `SMS Opt-In — ${name}`,
    description: `Sign up to receive SMS text messages from ${name}.`,
  };
}

export default async function BrandedOptInPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusiness(slug);

  if (!business) notFound();

  const businessName = business.business_name || 'This business';
  const consentText = buildConsentText(businessName);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{businessName}</h1>
            <p className="text-gray-600 mt-1 text-sm">
              Sign up to receive text messages from {businessName}.
            </p>
          </div>

          <BrandedOptInForm
            slug={slug}
            businessName={businessName}
            consentText={consentText}
          />
        </div>

        {/* Server-rendered compliance footer — must be readable without JS */}
        <div className="mt-6 text-center text-xs text-gray-500 space-y-1">
          <p>
            By opting in you agree to receive SMS text messages from {businessName}. Message and
            data rates may apply. Message frequency varies. Consent is not a condition of purchase.
          </p>
          <p>
            Your mobile opt-in information will not be shared with third parties for marketing or
            promotional purposes.
          </p>
          <p>Reply STOP to unsubscribe at any time. Reply HELP for assistance.</p>
          <p className="pt-1">
            <Link href="/privacy" className="text-teal-600 hover:underline">Privacy Policy</Link>
            {' · '}
            <Link href="/terms" className="text-teal-600 hover:underline">Terms of Service</Link>
          </p>
          <p className="pt-2 text-gray-400">
            SMS delivered via HyveWyre on behalf of {businessName}.
          </p>
        </div>
      </div>
    </div>
  );
}
