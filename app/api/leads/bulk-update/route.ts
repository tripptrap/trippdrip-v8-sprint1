import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BulkUpdateRequest {
  leadIds: string[];
  updates: {
    status?: string;
    disposition?: string;
    addTags?: string[];
    removeTags?: string[];
    temperature?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body: BulkUpdateRequest = await req.json();
    const { leadIds, updates } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No lead IDs provided" },
        { status: 400 }
      );
    }

    // Fetch the leads that need updating
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .in('id', leadIds)
      .eq('user_id', user.id);

    if (fetchError) {
      console.error('Error fetching leads:', fetchError);
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: false, error: 'No leads found' }, { status: 404 });
    }

    // Update each lead
    const updatePromises = leads.map(async (lead) => {
      const updateData: any = { updated_at: new Date().toISOString() };

      // Update status
      if (updates.status !== undefined) {
        updateData.status = updates.status;
      }

      // Update disposition
      if (updates.disposition !== undefined) {
        updateData.disposition = updates.disposition;

        // Auto-update status based on disposition
        if (updates.disposition === 'not_interested') {
          updateData.status = 'archived';
        } else if (updates.disposition === 'sold') {
          updateData.status = 'sold';
        }
      }

      // Update temperature
      if (updates.temperature !== undefined) {
        updateData.temperature = updates.temperature;
      }

      // Handle tags
      let newTags = Array.isArray(lead.tags) ? [...lead.tags] : [];

      // Add tags
      if (Array.isArray(updates.addTags) && updates.addTags.length > 0) {
        newTags = [...new Set([...newTags, ...updates.addTags])];
      }

      // Remove tags
      if (Array.isArray(updates.removeTags) && updates.removeTags.length > 0) {
        newTags = newTags.filter(tag => !updates.removeTags!.includes(tag));
      }

      updateData.tags = newTags;

      // Perform the update
      return supabase
        .from('leads')
        .update(updateData)
        .eq('id', lead.id)
        .eq('user_id', user.id);
    });

    const results = await Promise.all(updatePromises);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      console.error('Some updates failed:', errors);
      return NextResponse.json({
        ok: false,
        error: `Failed to update ${errors.length} lead(s)`,
        updatedCount: results.length - errors.length,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      updatedCount: results.length,
      message: `Successfully updated ${results.length} lead(s)`,
    });
  } catch (error: any) {
    console.error("Error in bulk update:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to update leads" },
      { status: 500 }
    );
  }
}
