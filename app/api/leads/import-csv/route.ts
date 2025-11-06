import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    // Read file content
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return NextResponse.json({ ok: false, error: 'CSV file is empty or invalid' }, { status: 400 });
    }

    // Parse CSV header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Required fields
    const requiredFields = ['first_name', 'last_name', 'phone'];
    const missingFields = requiredFields.filter(f => !header.includes(f));

    if (missingFields.length > 0) {
      return NextResponse.json({
        ok: false,
        error: `Missing required fields: ${missingFields.join(', ')}. Required: first_name, last_name, phone`
      }, { status: 400 });
    }

    // Parse leads
    const leads = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const values = line.split(',').map(v => v.trim());

      if (values.length !== header.length) {
        errors.push(`Line ${i + 1}: Column count mismatch`);
        continue;
      }

      const leadData: any = {
        user_id: user.id,
      };

      // Map CSV columns to lead fields
      header.forEach((field, index) => {
        const value = values[index].replace(/^["']|["']$/g, ''); // Remove quotes

        switch (field) {
          case 'first_name':
            leadData.first_name = value;
            break;
          case 'last_name':
            leadData.last_name = value;
            break;
          case 'phone':
            // Clean phone number
            leadData.phone = value.replace(/[^\d+]/g, '');
            break;
          case 'email':
            leadData.email = value || null;
            break;
          case 'company':
            leadData.company = value || null;
            break;
          case 'source':
            leadData.source = value || 'csv_import';
            break;
          case 'status':
            leadData.status = value || 'new';
            break;
          case 'disposition':
            leadData.disposition = value || null;
            break;
          case 'tags':
            leadData.tags = value ? value.split(';').map((t: string) => t.trim()) : [];
            break;
          case 'notes':
            leadData.notes = value || null;
            break;
        }
      });

      // Validate required fields
      if (!leadData.first_name || !leadData.last_name || !leadData.phone) {
        errors.push(`Line ${i + 1}: Missing required fields`);
        continue;
      }

      // Validate phone number
      if (leadData.phone.length < 10) {
        errors.push(`Line ${i + 1}: Invalid phone number (${leadData.phone})`);
        continue;
      }

      leads.push(leadData);
    }

    if (leads.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'No valid leads found in CSV',
        errors
      }, { status: 400 });
    }

    // Insert leads into Supabase
    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(leads)
      .select();

    if (insertError) {
      console.error('Error inserting leads:', insertError);
      return NextResponse.json({
        ok: false,
        error: `Database error: ${insertError.message}`
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      imported: insertedLeads?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${insertedLeads?.length || 0} leads${errors.length > 0 ? ` (${errors.length} errors)` : ''}`
    });

  } catch (error: any) {
    console.error('CSV import error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to import CSV'
    }, { status: 500 });
  }
}
