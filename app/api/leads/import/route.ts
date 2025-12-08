import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function uniq<T>(a: T[]) {
  return Array.from(new Set(a));
}

export async function POST(req: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    console.log(`[Import] Received body keys:`, Object.keys(body || {}));
    console.log(`[Import] body.campaignName raw:`, body?.campaignName);
    const incoming = Array.isArray(body?.items) ? body.items : (Array.isArray(body?.rows) ? body.rows : []);
    const addTags = Array.isArray(body?.addTags) ? body.addTags.map((t: any)=>String(t).trim()).filter(Boolean) : [];
    const campaignName = body?.campaignName ? String(body.campaignName).trim() : "";
    console.log(`[Import] campaignName after parsing:`, campaignName);

    if (!incoming.length) {
      return NextResponse.json({ ok: false, error: "No leads to import" }, { status: 400 });
    }

    console.log(`[Import] Received ${incoming.length} leads to import for user ${user.id}`);
    console.log(`[Import] First lead sample:`, JSON.stringify(incoming[0], null, 2));

    // First, find or create the campaign if campaignName is provided (need ID before inserting leads)
    let campaignId: string | null = null;
    console.log(`[Import] Campaign name provided: "${campaignName}"`);
    if (campaignName) {
      console.log(`[Import] Finding or creating campaign "${campaignName}"`);

      // Check if campaign exists
      const { data: existingCampaign, error: findError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id)
        .ilike('name', campaignName)
        .single();

      if (findError && findError.code !== 'PGRST116') {
        console.error('[Import] Error finding campaign:', findError);
      }

      if (existingCampaign) {
        campaignId = existingCampaign.id;
        console.log(`[Import] Found existing campaign: ${campaignId}`);
      } else {
        console.log(`[Import] Creating new campaign: ${campaignName}`);
        const { data: newCampaign, error: createError } = await supabase
          .from('campaigns')
          .insert({
            user_id: user.id,
            name: campaignName
          })
          .select()
          .single();

        if (createError) {
          console.error('[Import] Error creating campaign:', createError);
        } else if (newCampaign) {
          campaignId = newCampaign.id;
          console.log(`[Import] Campaign created: ${campaignId}`);
        }
      }
    }

    // Prepare leads for Supabase insert - include campaign_id if available
    const leadsToInsert = incoming.map((l: any) => {
      const currentTags = Array.isArray(l?.tags) ? l.tags : (l?.tags ? String(l.tags).split(",").map((s:string)=>s.trim()).filter(Boolean) : []);
      const lead: any = {
        user_id: user.id,
        first_name: l.first_name || null,
        last_name: l.last_name || null,
        phone: l.phone || null,
        email: l.email || null,
        state: l.state || null,
        tags: uniq([...currentTags, ...addTags]),
      };
      // Add campaign_id if we have a campaign
      if (campaignId) {
        lead.campaign_id = campaignId;
      }
      return lead;
    });

    console.log(`[Import] Prepared ${leadsToInsert.length} leads for insertion`);

    // Insert leads into Supabase - try with campaign_id first, fallback without
    let insertedLeads: any[] | null = null;
    let insertError: any = null;

    const { data, error } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select();

    insertedLeads = data;
    insertError = error;

    // If campaign_id column doesn't exist, retry without it
    if (insertError && insertError.message?.includes('campaign_id')) {
      console.log('[Import] campaign_id column not found, retrying without it');
      const leadsWithoutCampaign = incoming.map((l: any) => {
        const currentTags = Array.isArray(l?.tags) ? l.tags : (l?.tags ? String(l.tags).split(",").map((s:string)=>s.trim()).filter(Boolean) : []);
        return {
          user_id: user.id,
          first_name: l.first_name || null,
          last_name: l.last_name || null,
          phone: l.phone || null,
          email: l.email || null,
          state: l.state || null,
          tags: uniq([...currentTags, ...addTags]),
        };
      });

      const { data: retryData, error: retryError } = await supabase
        .from('leads')
        .insert(leadsWithoutCampaign)
        .select();

      insertedLeads = retryData;
      insertError = retryError;
    }

    if (insertError) {
      console.error('[Import] Error inserting leads:', insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    console.log(`[Import] Successfully inserted ${insertedLeads?.length || 0} leads`);

    const addedCount = insertedLeads?.length || 0;

    // Update campaign timestamp if we added leads to it
    if (campaignId && addedCount > 0) {
      await supabase
        .from('campaigns')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', campaignId);
    }

    // Get total lead count for this user
    const { count: totalCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      message: "leads successfully uploaded",
      campaignId,
      added: addedCount,
      total: totalCount || addedCount
    });
  } catch (e: any) {
    console.error('Import error:', e);
    return NextResponse.json({ ok: false, error: e?.message || "Import failed" }, { status: 400 });
  }
}
