// API Route: Convert scraped data to leads
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { scrapedDataIds } = await req.json();

    if (!scrapedDataIds || scrapedDataIds.length === 0) {
      return NextResponse.json({ error: 'No records selected' }, { status: 400 });
    }

    let converted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const dataId of scrapedDataIds) {
      try {
        // Get scraped data
        const { data: scrapedData, error: fetchError } = await supabase
          .from('scraped_data')
          .select('*')
          .eq('id', dataId)
          .eq('user_id', user.id)
          .single();

        if (fetchError || !scrapedData) {
          failed++;
          errors.push(`Record ${dataId}: Not found`);
          continue;
        }

        // Skip if already converted
        if (scrapedData.status === 'converted') {
          continue;
        }

        const data = scrapedData.data;

        // Extract lead information from scraped data
        const leadData: any = {
          user_id: user.id,
          source: 'web-scraper',
          source_url: scrapedData.source_url,
        };

        // Map common fields
        if (data.name || data.businessName || data.fullName) {
          leadData.name = data.name || data.businessName || data.fullName;
        }

        if (data.firstName && data.lastName) {
          leadData.name = `${data.firstName} ${data.lastName}`;
        }

        if (data.email) {
          leadData.email = data.email;
        }

        if (data.phone || data.phoneNumber) {
          leadData.phone = data.phone || data.phoneNumber;
        }

        if (data.company || data.businessName || data.companyName) {
          leadData.company = data.company || data.businessName || data.companyName;
        }

        if (data.title || data.jobTitle || data.position) {
          leadData.title = data.title || data.jobTitle || data.position;
        }

        if (data.address || data.location) {
          leadData.address = data.address || data.location;
        }

        if (data.website || data.websiteUrl) {
          leadData.website = data.website || data.websiteUrl;
        }

        if (data.city) leadData.city = data.city;
        if (data.state) leadData.state = data.state;
        if (data.zip || data.zipCode) leadData.zip = data.zip || data.zipCode;
        if (data.country) leadData.country = data.country;

        // Store all scraped data in notes
        leadData.notes = `Scraped from: ${scrapedData.source_url}\n\nExtracted Data:\n${JSON.stringify(data, null, 2)}`;

        // Set default status
        leadData.status = 'new';
        leadData.disposition = 'uncontacted';

        // Validate required fields
        if (!leadData.name && !leadData.email && !leadData.phone) {
          failed++;
          errors.push(`Record ${dataId}: Missing required fields (name, email, or phone)`);
          continue;
        }

        // Check for duplicate leads
        let isDuplicate = false;
        if (leadData.email) {
          const { data: existingByEmail } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', user.id)
            .eq('email', leadData.email)
            .single();

          if (existingByEmail) {
            isDuplicate = true;
          }
        }

        if (!isDuplicate && leadData.phone) {
          const { data: existingByPhone } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', user.id)
            .eq('phone', leadData.phone)
            .single();

          if (existingByPhone) {
            isDuplicate = true;
          }
        }

        if (isDuplicate) {
          // Mark as duplicate
          await supabase
            .from('scraped_data')
            .update({ status: 'duplicate' })
            .eq('id', dataId);

          failed++;
          errors.push(`Record ${dataId}: Duplicate lead already exists`);
          continue;
        }

        // Create lead
        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert(leadData)
          .select()
          .single();

        if (leadError || !newLead) {
          console.error('Error creating lead:', leadError);
          failed++;
          errors.push(`Record ${dataId}: ${leadError?.message || 'Failed to create lead'}`);
          continue;
        }

        // Update scraped data status
        await supabase
          .from('scraped_data')
          .update({
            status: 'converted',
            converted_to_lead_id: newLead.id,
          })
          .eq('id', dataId);

        converted++;

      } catch (error: any) {
        console.error(`Error converting record ${dataId}:`, error);
        failed++;
        errors.push(`Record ${dataId}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      converted,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully converted ${converted} records to leads. ${failed} failed.`,
    });

  } catch (error: any) {
    console.error('Convert to leads error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// GET: Get scraped data ready for conversion
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scraperId = searchParams.get('scraperId');

    let query = supabase
      .from('scraped_data')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'new')
      .order('created_at', { ascending: false });

    if (scraperId) {
      query = query.eq('scraper_config_id', scraperId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching scraped data:', error);
      return NextResponse.json({ error: 'Failed to fetch scraped data' }, { status: 500 });
    }

    return NextResponse.json({ success: true, records: data || [] });

  } catch (error: any) {
    console.error('Get scraped data error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
