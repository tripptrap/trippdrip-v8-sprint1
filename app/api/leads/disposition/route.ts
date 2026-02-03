import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndEnrollDripTriggers } from '@/lib/drip/triggerEnrollment';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, disposition } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Lead ID is required' }, { status: 400 });
    }

    if (!disposition) {
      return NextResponse.json({ ok: false, error: 'Disposition is required' }, { status: 400 });
    }

    // Validate disposition values
    const validDispositions = ['sold', 'not_interested'];
    if (!validDispositions.includes(disposition)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid disposition value' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // If marking as sold, convert to client
    if (disposition === 'sold') {
      // Fetch lead data
      const { data: leadData, error: fetchError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !leadData) {
        return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
      }

      if (leadData.client_id) {
        return NextResponse.json({ ok: false, error: 'Lead already converted to client' }, { status: 409 });
      }

      // Create client record
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .insert({
          user_id: user.id,
          original_lead_id: id,
          first_name: leadData.first_name,
          last_name: leadData.last_name,
          phone: leadData.phone,
          email: leadData.email,
          state: leadData.state,
          zip_code: leadData.zip_code,
          tags: leadData.tags || [],
          campaign_id: leadData.campaign_id,
          source: leadData.source,
          notes: leadData.notes,
          custom_fields: leadData.custom_fields || {},
          converted_from_lead_at: new Date().toISOString(),
          sold_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (clientError) {
        console.error('Error creating client:', clientError);
        return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 });
      }

      // Update lead with sold status and client reference
      const { data: lead } = await supabase
        .from('leads')
        .update({
          disposition: 'sold',
          status: 'sold',
          client_id: client.id,
          converted: true,
          converted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      return NextResponse.json({
        ok: true,
        message: 'Lead converted to client successfully',
        lead,
        clientId: client.id,
      });
    }

    // For other dispositions, just update normally
    let status;
    if (disposition === 'not_interested') {
      status = 'archived';
    }

    const updateData: any = { disposition, updated_at: new Date().toISOString() };
    if (status) {
      updateData.status = status;
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating lead disposition:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found or access denied' }, { status: 404 });
    }

    // Check for drip campaign triggers (status_change)
    // Pass the actual status value (not the disposition name)
    const actualStatus = disposition === 'not_interested' ? 'archived' : disposition;
    checkAndEnrollDripTriggers(supabase, user.id, id, 'status_change', {
      status: actualStatus,
    });

    return NextResponse.json({
      ok: true,
      message: 'Lead disposition updated successfully',
      lead
    });
  } catch (error: any) {
    console.error('Error updating lead disposition:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update disposition' },
      { status: 500 }
    );
  }
}
