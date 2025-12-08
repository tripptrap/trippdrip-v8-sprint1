import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_AI_SETTINGS, UserAISettings } from "@/lib/ai/models";

// GET - Load user's AI settings
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

    // Get user's AI settings from user_settings table
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('ai_settings')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("Error loading AI settings:", error);
      return NextResponse.json(
        { error: "Failed to load settings" },
        { status: 500 }
      );
    }

    // Return existing settings or defaults
    const aiSettings = settings?.ai_settings || DEFAULT_USER_AI_SETTINGS;

    return NextResponse.json({
      ok: true,
      settings: aiSettings
    });
  } catch (error: any) {
    console.error("Error in GET /api/ai-settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load AI settings" },
      { status: 500 }
    );
  }
}

// POST - Save user's AI settings
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { settings } = body as { settings: UserAISettings };

    if (!settings) {
      return NextResponse.json(
        { error: "Settings are required" },
        { status: 400 }
      );
    }

    // Check if user_settings row exists
    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      // Update existing row
      const { error } = await supabase
        .from('user_settings')
        .update({
          ai_settings: settings,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) {
        console.error("Error updating AI settings:", error);
        return NextResponse.json(
          { error: "Failed to save settings" },
          { status: 500 }
        );
      }
    } else {
      // Insert new row
      const { error } = await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          ai_settings: settings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error("Error inserting AI settings:", error);
        return NextResponse.json(
          { error: "Failed to save settings" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "AI settings saved successfully"
    });
  } catch (error: any) {
    console.error("Error in POST /api/ai-settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save AI settings" },
      { status: 500 }
    );
  }
}
