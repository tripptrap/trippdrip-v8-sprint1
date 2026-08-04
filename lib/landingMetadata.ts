import type { Metadata } from 'next';

// One definition of the public landing metadata.
//
// It existed three times — app/page.tsx, app/(public)/preview/page.tsx (a
// byte-identical copy, both rendering the same PreviewClient) and a third
// variant in app/layout.tsx. Updating the verticals in one of them left
// hyvewyre.com itself still titled "for Insurance & Real Estate Agents", which
// is the one users and search engines actually see.
//
// That is the same failure mode as any duplicated constant: the copy you did not
// know about is the one that stays wrong. Both pages now import this.
//
// ── Why the wording is what it is ──────────────────────────────────────────
//
// The product serves any business that does outreach — insurance, real estate,
// solar, roofing, home services, financial services — and the 10DLC campaign
// registered with the carriers describes it that way. A title naming two
// industries both turns away every other visitor and disagrees with our own
// carrier filing.
//
// Insurance and real estate stay in the keywords: still real use cases, still
// worth ranking for. They are examples now rather than the definition.
export const landingMetadata: Metadata = {
  title: 'HyveWyre - AI-Powered SMS Marketing for Sales Teams | Automate Lead Conversations',
  description:
    'HyveWyre helps agents and small businesses automate SMS conversations, manage leads, and close more deals — insurance, real estate, solar, roofing, home services and more. AI messaging workflows, bulk SMS, drip campaigns, and a built-in CRM.',
  keywords:
    'SMS marketing, lead management, AI chatbot, bulk SMS, drip campaigns, text message marketing, sales automation, CRM for agents, insurance agents, real estate SMS, solar leads, home services marketing',
  openGraph: {
    title: 'HyveWyre - AI SMS Marketing for Sales Teams',
    description:
      'Automate conversations, manage leads and close more deals with AI-powered SMS built for businesses that do outreach.',
    type: 'website',
    url: 'https://hyvewyre.com',
    siteName: 'HyveWyre',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HyveWyre - AI SMS Marketing for Sales Teams',
    description: 'Automate conversations and close more deals with AI-powered SMS marketing.',
  },
};
