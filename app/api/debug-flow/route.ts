import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // LOW-11: Restrict to admin users only — exposes full flow config
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all flows for this user
    const { data: flows, error } = await supabase
      .from('conversation_flows')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return flows with their full structure
    return NextResponse.json({
      flows: flows?.map(flow => ({
        id: flow.id,
        name: flow.name,
        requiresCall: flow.requires_call,
        requiredQuestions: flow.required_questions,
        steps: flow.steps,
        context: flow.context
      }))
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
