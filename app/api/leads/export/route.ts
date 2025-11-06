import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { Parser } from "json2csv";

interface Lead {
  id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  status?: string;
  disposition?: string;
  score?: number;
  temperature?: string;
  created_at?: string;
  [key: string]: any;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadIds, format } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No lead IDs provided" },
        { status: 400 }
      );
    }

    const dataDir = path.join(process.cwd(), "data");
    const leadsPath = path.join(dataDir, "leads.json");

    // Read leads
    const leadsData = await fs.readFile(leadsPath, "utf-8");
    const allLeads: Lead[] = JSON.parse(leadsData);

    // Filter selected leads
    const selectedLeads = allLeads.filter(lead =>
      leadIds.includes(String(lead.id))
    );

    if (selectedLeads.length === 0) {
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
        'state',
        'tags',
        'status',
        'disposition',
        'score',
        'temperature',
        'created_at',
      ];

      // Transform data for CSV
      const dataForCSV = selectedLeads.map(lead => ({
        ...lead,
        tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
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
