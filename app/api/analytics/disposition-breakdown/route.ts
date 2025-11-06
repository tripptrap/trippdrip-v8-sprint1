import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Lead {
  id: string;
  disposition?: string;
  status?: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch leads for current user
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, disposition, status')
      .eq('user_id', user.id);

    if (error) {
      console.error("Error fetching leads:", error);
      return NextResponse.json(
        { error: "Failed to fetch disposition breakdown" },
        { status: 500 }
      );
    }

    const leadsData = leads || [];

    // Count leads by disposition
    const dispositionCounts: { [key: string]: number } = {};

    leadsData.forEach(lead => {
      const disposition = lead.disposition || 'none';
      dispositionCounts[disposition] = (dispositionCounts[disposition] || 0) + 1;
    });

    // Convert to array format for charts
    const data = Object.keys(dispositionCounts).map(disposition => ({
      name: disposition === 'none' ? 'No Disposition' : disposition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: dispositionCounts[disposition],
      percentage: leadsData.length > 0 ? ((dispositionCounts[disposition] / leadsData.length) * 100).toFixed(1) : '0',
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
