import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface Lead {
  id: string;
  disposition?: string;
  status?: string;
}

export async function GET(req: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const leadsData = await fs.readFile(path.join(dataDir, "leads.json"), "utf-8");
    const leads: Lead[] = JSON.parse(leadsData);

    // Count leads by disposition
    const dispositionCounts: { [key: string]: number } = {};

    leads.forEach(lead => {
      const disposition = lead.disposition || 'none';
      dispositionCounts[disposition] = (dispositionCounts[disposition] || 0) + 1;
    });

    // Convert to array format for charts
    const data = Object.keys(dispositionCounts).map(disposition => ({
      name: disposition === 'none' ? 'No Disposition' : disposition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: dispositionCounts[disposition],
      percentage: ((dispositionCounts[disposition] / leads.length) * 100).toFixed(1),
    }));

    // Sort by value (highest first)
    data.sort((a, b) => b.value - a.value);

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching disposition breakdown:", error);
    return NextResponse.json(
      { error: "Failed to fetch disposition breakdown" },
      { status: 500 }
    );
  }
}
