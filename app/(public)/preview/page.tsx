import { Metadata } from 'next';
import PreviewClient from './PreviewClient';

// Verticals are open, so the metadata no longer says otherwise.
//
// Written when the product was aimed at insurance and real estate — the title,
// description and both social cards all said so. It now serves any business that
// does outreach (solar, roofing, home services, financial services), and the
// 10DLC campaign registered with the carriers describes it that way too. A title
// naming two industries turns every other visitor away before they read a word,
// and disagrees with the filing.
//
// Insurance and real estate stay in the keywords: still real use cases, still
// worth ranking for. They are examples now rather than the definition.
export const metadata: Metadata = {
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

export default function PreviewPage() {
  return <PreviewClient />;
}
