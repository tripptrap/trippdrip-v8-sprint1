// API Route: Run web scraper
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractDataFromHtml, generateRecordHash, RateLimiter, findNextPageUrl } from '@/lib/scraper';
import { spendPointsForAction } from '@/lib/pointsSupabaseServer';

// Cost to run a scraper
const SCRAPER_RUN_COST = 50; // points

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { scraperId, maxPages } = await req.json();

    if (!scraperId) {
      return NextResponse.json({ error: 'Scraper ID is required' }, { status: 400 });
    }

    // Check if user has enough points (from users.credits table)
    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    const currentPoints = userData?.credits || 0;

    if (currentPoints < SCRAPER_RUN_COST) {
      return NextResponse.json({
        error: `Insufficient points. Need ${SCRAPER_RUN_COST} points to run scraper.`,
        currentPoints,
        requiredPoints: SCRAPER_RUN_COST,
        needsPoints: true,
      }, { status: 402 }); // 402 Payment Required
    }

    // Fetch scraper config
    const { data: scraper, error: scraperError } = await supabase
      .from('scraper_configs')
      .select('*')
      .eq('id', scraperId)
      .eq('user_id', user.id)
      .single();

    if (scraperError || !scraper) {
      return NextResponse.json({ error: 'Scraper not found' }, { status: 404 });
    }

    // Create run record
    const { data: run, error: runError } = await supabase
      .from('scraper_runs')
      .insert({
        scraper_config_id: scraperId,
        user_id: user.id,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Failed to create run record' }, { status: 500 });
    }

    // Deduct points for scraper run
    const pointsResult = await spendPointsForAction('scraper_run', 1);

    if (!pointsResult.success) {
      return NextResponse.json({
        error: pointsResult.error || 'Failed to deduct points',
        needsPoints: true,
      }, { status: 402 });
    }

    // Start scraping process (async)
    runScraper(scraperId, run.id, user.id, scraper, maxPages || scraper.settings.maxPages || 10);

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: 'Scraper started successfully',
      pointsRemaining: pointsResult.balance,
      pointsSpent: SCRAPER_RUN_COST,
    });

  } catch (error: any) {
    console.error('Scraper run error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * Run scraper asynchronously
 */
async function runScraper(
  scraperId: string,
  runId: string,
  userId: string,
  scraper: any,
  maxPages: number
) {
  const supabase = await createClient();
  const startTime = Date.now();

  let recordsFound = 0;
  let recordsNew = 0;
  let recordsDuplicate = 0;
  let recordsInvalid = 0;
  let pagesScraped = 0;
  let currentUrl = scraper.start_url;

  const rateLimiter = new RateLimiter(scraper.settings?.delay || 2000);

  try {
    const { fields, pagination } = scraper.extraction_rules;

    // Scrape pages
    while (currentUrl && pagesScraped < maxPages) {
      await rateLimiter.throttle();

      try {
        let html: string;

        // Try different scraping methods based on site
        try {
          // Method 1: Try simple fetch first (fastest, works for simple sites)
          const response = await fetch(currentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Cache-Control': 'max-age=0',
            },
            signal: AbortSignal.timeout(scraper.settings?.timeout || 30000),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          html = await response.text();
        } catch (fetchError: any) {
          console.log(`Simple fetch failed for ${currentUrl}, error: ${fetchError.message}`);

          // Method 2: If fetch fails, try using a CORS proxy (free alternative)
          try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(currentUrl)}`;
            const proxyResponse = await fetch(proxyUrl, {
              signal: AbortSignal.timeout(45000),
            });

            if (!proxyResponse.ok) {
              throw new Error(`Proxy failed: ${proxyResponse.status}`);
            }

            html = await proxyResponse.text();
            console.log(`✅ Successfully fetched via CORS proxy: ${currentUrl}`);
          } catch (proxyError: any) {
            console.error(`Both fetch and proxy failed for ${currentUrl}`);
            throw new Error(`Unable to fetch page: ${fetchError.message}. Consider upgrading to ScraperAPI for reliable scraping.`);
          }
        }

        pagesScraped++;

        // Extract data
        const extracted = extractDataFromHtml(html, currentUrl, fields);
        recordsFound++;

        // Validate extracted data
        const isValid = validateRecord(extracted.data, fields);

        if (!isValid) {
          recordsInvalid++;
          continue;
        }

        // Generate hash for duplicate detection
        const keyFields = fields
          .filter((f: any) => f.required)
          .map((f: any) => f.name);
        const hash = generateRecordHash(extracted.data, keyFields);

        // Check for duplicates
        const { data: existing } = await supabase
          .from('scraped_data')
          .select('id')
          .eq('duplicate_hash', hash)
          .eq('scraper_config_id', scraperId)
          .single();

        if (existing) {
          recordsDuplicate++;
          continue;
        }

        // Save scraped data
        const { error: insertError } = await supabase
          .from('scraped_data')
          .insert({
            scraper_config_id: scraperId,
            user_id: userId,
            data: extracted.data,
            source_url: extracted.sourceUrl,
            scraped_at: extracted.scrapedAt.toISOString(),
            duplicate_hash: hash,
            confidence_score: extracted.confidenceScore,
            status: 'new',
          });

        if (!insertError) {
          recordsNew++;
        }

        // Find next page
        if (pagination && pagination.selector) {
          currentUrl = findNextPageUrl(html, currentUrl, pagination.selector) || '';
        } else {
          currentUrl = ''; // No pagination
        }

      } catch (pageError: any) {
        console.error(`Error scraping page ${currentUrl}:`, pageError);
        // Continue to next page
        currentUrl = '';
      }
    }

    // Update run as completed
    const duration = Date.now() - startTime;
    await supabase
      .from('scraper_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        records_found: recordsFound,
        records_new: recordsNew,
        records_duplicate: recordsDuplicate,
        records_invalid: recordsInvalid,
        pages_scraped: pagesScraped,
        duration_ms: duration,
      })
      .eq('id', runId);

    // Update scraper stats
    await supabase
      .from('scraper_configs')
      .update({
        total_runs: scraper.total_runs + 1,
        total_records_scraped: scraper.total_records_scraped + recordsNew,
        last_run_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
      })
      .eq('id', scraperId);

  } catch (error: any) {
    console.error('Scraper execution error:', error);

    // Update run as failed
    await supabase
      .from('scraper_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        records_found: recordsFound,
        records_new: recordsNew,
        records_duplicate: recordsDuplicate,
        records_invalid: recordsInvalid,
        pages_scraped: pagesScraped,
        duration_ms: Date.now() - startTime,
      })
      .eq('id', runId);

    // Update scraper with error
    await supabase
      .from('scraper_configs')
      .update({
        last_run_at: new Date().toISOString(),
        last_error: error.message,
      })
      .eq('id', scraperId);
  }
}

/**
 * Validate extracted record
 */
function validateRecord(data: Record<string, any>, fields: any[]): boolean {
  // Check if all required fields have values
  for (const field of fields) {
    if (field.required && !data[field.name]) {
      return false;
    }
  }

  // Validate email if present
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return false;
  }

  // Validate phone if present
  if (data.phone && !/^\+?[\d\s\-\(\)]{10,}$/.test(data.phone)) {
    return false;
  }

  return true;
}
