import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.hyvewyre.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/auth/callback',
          '/auth/onboarding',
          '/dashboard/',
          '/settings/',
          '/leads/',
          '/messages/',
          '/campaigns/',
          '/templates/',
          '/analytics/',
          '/bulk-sms/',
          '/phone-numbers/',
          '/scheduled/',
          '/follow-ups/',
          '/tags/',
          '/dnc/',
          '/integrations/',
          '/appointments/',
          '/referrals/',
          '/points/',
          '/sms-analytics/',
          '/email/',
          '/ai-workflows/',
          '/lead-scraper/',
          '/texts/',
          '/team/',
          '/contact/',
          '/roadmap/',
          '/analytics-automation/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
