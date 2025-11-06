import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Parser } from "json2csv";

export const dynamic = "force-dynamic";

interface Lead {
  id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  company?: string;
  source?: string;
  tags?: string[];
  status?: string;
  disposition?: string;
  score?: number;
  temperature?: string;
  notes?: string;
  created_at?: string;
  last_contacted?: string;
  [key: string]: any;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { leadIds, format } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No lead IDs provided" },
        { status: 400 }
      );
    }

    // Fetch leads from Supabase
    const { data: selectedLeads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id)
      .in('id', leadIds);

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    if (!selectedLeads || selectedLeads.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No leads found" },
        { status: 404 }
      );
    }

    if (format === 'json') {
      // Return as JSON
      return NextResponse.json({
        ok: true,
        leads: selectedLeads,
      });
    } else {
      // Export as CSV
      const fields = [
        'id',
        'first_name',
        'last_name',
        'phone',
        'email',
        'company',
        'source',
        'tags',
        'status',
        'disposition',
        'score',
        'temperature',
        'notes',
        'created_at',
        'last_contacted',
      ];

      // Transform data for CSV
      const dataForCSV = selectedLeads.map(lead => ({
        ...lead,
        tags: Array.isArray(lead.tags) ? lead.tags.join(';') : '',
        created_at: lead.created_at ? new Date(lead.created_at).toISOString() : '',
        last_contacted: lead.last_contacted ? new Date(lead.last_contacted).toISOString() : '',
      }));

      const parser = new Parser({ fields });
      const csv = parser.parse(dataForCSV);

      // Return CSV file
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="leads-export-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }
  } catch (error) {
    console.error("Error exporting leads:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to export leads" },
      { status: 500 }
    );
  }
}
