// Web Scraper Utility Library
// Similar to Octoparse functionality

import * as cheerio from 'cheerio';
import crypto from 'crypto';

export interface ExtractionField {
  name: string;
  selector: string;
  type: 'text' | 'attr' | 'html' | 'link';
  attribute?: string; // For type='attr'
  required?: boolean;
  transform?: 'trim' | 'lowercase' | 'uppercase' | 'phone' | 'email';
}

export interface PaginationConfig {
  selector: string;
  type: 'link' | 'button' | 'infinite-scroll';
  maxPages?: number;
}

export interface ScraperConfig {
  fields: ExtractionField[];
  pagination?: PaginationConfig;
  maxPages?: number;
  delay?: number;
  respectRobots?: boolean;
}

export interface ScrapedRecord {
  data: Record<string, any>;
  sourceUrl: string;
  scrapedAt: Date;
  confidenceScore: number;
}

export interface ScraperResult {
  records: ScrapedRecord[];
  pagesScraped: number;
  errors: string[];
}

/**
 * Extract data from HTML using CSS selectors
 */
export function extractDataFromHtml(
  html: string,
  url: string,
  fields: ExtractionField[]
): ScrapedRecord {
  const $ = cheerio.load(html);
  const data: Record<string, any> = {};
  let confidenceScore = 1.0;

  for (const field of fields) {
    try {
      const elements = $(field.selector);

      if (elements.length === 0) {
        if (field.required) {
          confidenceScore -= 0.2;
        }
        data[field.name] = null;
        continue;
      }

      let value: string | null = null;

      switch (field.type) {
        case 'text':
          value = elements.first().text();
          break;
        case 'html':
          value = elements.first().html();
          break;
        case 'link':
          value = elements.first().attr('href') || null;
          if (value && !value.startsWith('http')) {
            // Convert relative URLs to absolute
            value = new URL(value, url).href;
          }
          break;
        case 'attr':
          value = elements.first().attr(field.attribute || 'value') || null;
          break;
      }

      // Apply transforms
      if (value && field.transform) {
        value = applyTransform(value, field.transform);
      }

      data[field.name] = value;
    } catch (error) {
      console.error(`Error extracting field ${field.name}:`, error);
      data[field.name] = null;
      confidenceScore -= 0.1;
    }
  }

  return {
    data,
    sourceUrl: url,
    scrapedAt: new Date(),
    confidenceScore: Math.max(0, confidenceScore),
  };
}

/**
 * Apply data transformations
 */
function applyTransform(value: string, transform: string): string {
  switch (transform) {
    case 'trim':
      return value.trim();
    case 'lowercase':
      return value.toLowerCase().trim();
    case 'uppercase':
      return value.toUpperCase().trim();
    case 'phone':
      return cleanPhoneNumber(value);
    case 'email':
      return value.toLowerCase().trim();
    default:
      return value.trim();
  }
}

/**
 * Clean and normalize phone numbers
 */
function cleanPhoneNumber(phone: string): string {
  // Remove all non-numeric characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If it starts with 1 and has 11 digits, add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = '+' + cleaned;
  }
  // If it has 10 digits, add +1
  else if (cleaned.length === 10) {
    cleaned = '+1' + cleaned;
  }
  // If it doesn't start with +, add it
  else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone);
}

/**
 * Generate hash for duplicate detection
 */
export function generateRecordHash(data: Record<string, any>, keyFields: string[]): string {
  const values = keyFields
    .map(field => String(data[field] || '').toLowerCase().trim())
    .filter(v => v)
    .join('|');

  return crypto.createHash('md5').update(values).digest('hex');
}

/**
 * Find pagination link in HTML
 */
export function findNextPageUrl(html: string, currentUrl: string, paginationSelector: string): string | null {
  const $ = cheerio.load(html);
  const nextLink = $(paginationSelector).first();

  if (nextLink.length === 0) {
    return null;
  }

  let href = nextLink.attr('href');
  if (!href) {
    return null;
  }

  // Convert relative URL to absolute
  if (!href.startsWith('http')) {
    href = new URL(href, currentUrl).href;
  }

  return href;
}

/**
 * Scraper rate limiting utility
 */
export class RateLimiter {
  private lastRequest: number = 0;
  private minDelay: number;

  constructor(minDelayMs: number = 2000) {
    this.minDelay = minDelayMs;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;

    if (timeSinceLastRequest < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequest = Date.now();
  }
}

/**
 * Pre-built scraper templates
 */
export const SCRAPER_TEMPLATES = {
  'linkedin-profile': {
    name: 'LinkedIn Profile',
    category: 'social-media',
    description: 'Coming Soon - Requires premium integration',
    comingSoon: true,
    fields: [
      { name: 'name', selector: '.text-heading-xlarge', type: 'text', required: true },
      { name: 'title', selector: '.text-body-medium', type: 'text' },
      { name: 'location', selector: '.text-body-small.inline.t-black--light.break-words', type: 'text' },
      { name: 'profileUrl', selector: 'link[rel="canonical"]', type: 'attr', attribute: 'href' },
    ],
  },
  'facebook-business': {
    name: 'Facebook Business Page',
    category: 'social-media',
    description: 'Coming Soon - Requires premium integration',
    comingSoon: true,
    fields: [
      { name: 'businessName', selector: 'h1', type: 'text', required: true },
      { name: 'category', selector: '[data-testid="category"]', type: 'text' },
      { name: 'phone', selector: '[data-testid="phone"]', type: 'text', transform: 'phone' },
      { name: 'website', selector: 'a[href*="l.facebook.com"]', type: 'attr', attribute: 'href' },
      { name: 'address', selector: '[data-testid="address"]', type: 'text' },
    ],
  },
  'yelp-business': {
    name: 'Yelp Business',
    category: 'business-directory',
    description: 'Extract business details from Yelp listings',
    fields: [
      { name: 'businessName', selector: 'h1', type: 'text', required: true },
      { name: 'phone', selector: '[href^="tel:"]', type: 'text', transform: 'phone' },
      { name: 'website', selector: '[href*="biz_redir"]', type: 'attr', attribute: 'href' },
      { name: 'address', selector: 'address', type: 'text' },
      { name: 'rating', selector: '[role="img"][aria-label*="star rating"]', type: 'attr', attribute: 'aria-label' },
    ],
  },
  'google-maps': {
    name: 'Google Maps Business',
    category: 'business-directory',
    description: 'Coming Soon - Requires premium integration',
    comingSoon: true,
    fields: [
      { name: 'businessName', selector: 'h1.DUwDvf', type: 'text', required: true },
      { name: 'category', selector: 'button[jsaction*="category"]', type: 'text' },
      { name: 'phone', selector: 'button[data-tooltip="Copy phone number"]', type: 'text', transform: 'phone' },
      { name: 'website', selector: 'a[data-tooltip="Open website"]', type: 'attr', attribute: 'href' },
      { name: 'address', selector: 'button[data-tooltip="Copy address"]', type: 'text' },
    ],
  },
  'zillow-listing': {
    name: 'Zillow Real Estate',
    category: 'real-estate',
    description: 'Extract property and agent info from Zillow',
    fields: [
      { name: 'address', selector: 'h1[data-testid="property-address"]', type: 'text', required: true },
      { name: 'price', selector: '[data-testid="price"]', type: 'text' },
      { name: 'agentName', selector: '[data-testid="attribution-LISTING_AGENT"] .Text-c11n-8-84-3__sc-aiai24-0', type: 'text' },
      { name: 'agentPhone', selector: '[data-testid="agent-phone"]', type: 'text', transform: 'phone' },
      { name: 'listingUrl', selector: 'link[rel="canonical"]', type: 'attr', attribute: 'href' },
    ],
  },
  'realtor-listing': {
    name: 'Realtor.com Listing',
    category: 'real-estate',
    description: 'Extract property details from Realtor.com',
    fields: [
      { name: 'address', selector: '[data-label="property-address"]', type: 'text', required: true },
      { name: 'price', selector: '[data-label="property-price"]', type: 'text' },
      { name: 'agentName', selector: '[data-testid="agent-name"]', type: 'text' },
      { name: 'agentPhone', selector: '[data-testid="agent-phone"]', type: 'text', transform: 'phone' },
      { name: 'brokerageName', selector: '[data-testid="brokerage-name"]', type: 'text' },
    ],
  },
  'craigslist': {
    name: 'Craigslist Ad',
    category: 'classifieds',
    description: 'Extract contact info from Craigslist posts',
    fields: [
      { name: 'title', selector: '#titletextonly', type: 'text', required: true },
      { name: 'price', selector: '.price', type: 'text' },
      { name: 'location', selector: '.postingtitletext small', type: 'text' },
      { name: 'description', selector: '#postingbody', type: 'text' },
      { name: 'email', selector: '.reply-button', type: 'attr', attribute: 'href' },
    ],
  },
};
