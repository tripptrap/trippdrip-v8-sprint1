import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET - Fetch all appointments for the user
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'upcoming'; // upcoming, past, all
    const limit = parseInt(searchParams.get('limit') || '50');

    const now = new Date().toISOString();

    // Build query
    let query = supabase
      .from('calendar_events')
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          phone,
          email,
          status,
          disposition
        )
      `)
      .eq('user_id', user.id)
      .limit(limit);

    // Apply filter
    if (filter === 'upcoming') {
      query = query.gte('start_time', now).order('start_time', { ascending: true });
    } else if (filter === 'past') {
      query = query.lt('start_time', now).order('start_time', { ascending: false });
    } else {
      query = query.order('start_time', { ascending: false });
    }

    const { data: appointments, error } = await query;

    if (error) {
      console.error("Error fetching appointments:", error);
      return NextResponse.json(
        { error: "Failed to fetch appointments" },
        { status: 500 }
      );
    }

    // Also get appointments from leads table (for appointments set via AI/flow)
    const { data: leadAppointments, error: leadError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, phone, email, status, disposition, appointment_scheduled, appointment_at, appointment_google_event_id')
      .eq('user_id', user.id)
      .eq('appointment_scheduled', true)
      .not('appointment_at', 'is', null);

    if (leadError) {
      console.error("Error fetching lead appointments:", leadError);
    }

    // Merge and deduplicate appointments
    const calendarEventIds = new Set(appointments?.map(a => a.google_event_id) || []);

    const additionalFromLeads = (leadAppointments || [])
      .filter(lead => lead.appointment_google_event_id && !calendarEventIds.has(lead.appointment_google_event_id))
      .map(lead => ({
        id: lead.appointment_google_event_id,
        google_event_id: lead.appointment_google_event_id,
        lead_id: lead.id,
        summary: `Call with ${lead.first_name} ${lead.last_name}`,
        start_time: lead.appointment_at,
        end_time: lead.appointment_at ? new Date(new Date(lead.appointment_at).getTime() + 30 * 60000).toISOString() : null,
        attendee_name: `${lead.first_name} ${lead.last_name}`,
        attendee_email: lead.email,
        leads: lead
      }));

    const allAppointments = [...(appointments || []), ...additionalFromLeads];

    // Sort by start_time
    allAppointments.sort((a, b) => {
      const dateA = new Date(a.start_time || 0).getTime();
      const dateB = new Date(b.start_time || 0).getTime();
      return filter === 'past' ? dateB - dateA : dateA - dateB;
    });

    // Filter based on upcoming/past after merge
    const filteredAppointments = allAppointments.filter(apt => {
      if (!apt.start_time) return false;
      const aptTime = new Date(apt.start_time).getTime();
      const nowTime = new Date().getTime();
      if (filter === 'upcoming') return aptTime >= nowTime;
      if (filter === 'past') return aptTime < nowTime;
      return true;
    });

    return NextResponse.json({
      ok: true,
      appointments: filteredAppointments.slice(0, limit),
      total: filteredAppointments.length
    });
  } catch (error: any) {
    console.error("Error in GET /api/appointments:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch appointments" },
      { status: 500 }
    );
  }
}

// DELETE - Cancel an appointment
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('id');

    if (!eventId) {
      return NextResponse.json(
        { error: "Event ID is required" },
        { status: 400 }
      );
    }

    // Get user's Google tokens
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('google_calendar_access_token, google_calendar_refresh_token')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.google_calendar_access_token) {
      // Just delete from database if no Google connection
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId)
        .eq('user_id', user.id);

      if (deleteError) {
        return NextResponse.json(
          { error: "Failed to delete appointment" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, message: "Appointment deleted from database" });
    }

    // Try to delete from Google Calendar
    try {
      const { data: event } = await supabase
        .from('calendar_events')
        .select('google_event_id')
        .eq('id', eventId)
        .eq('user_id', user.id)
        .single();

      if (event?.google_event_id) {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.google_event_id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${userData.google_calendar_access_token}`
            }
          }
        );

        if (!response.ok && response.status !== 404) {
          console.error("Failed to delete from Google Calendar:", response.status);
        }
      }
    } catch (googleError) {
      console.error("Error deleting from Google:", googleError);
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete appointment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Appointment cancelled" });
  } catch (error: any) {
    console.error("Error in DELETE /api/appointments:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel appointment" },
      { status: 500 }
    );
  }
}
