// API Route: Receptionist Settings CRUD
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ReceptionistSettings, ReceptionistSettingsInput, DEFAULT_RECEPTIONIST_SETTINGS } from '@/lib/receptionist/types';

// GET - Fetch user's receptionist settings
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has premium subscription
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const isPremium = userData?.subscription_tier === 'professional' || userData?.subscription_tier === 'premium';

    // Get receptionist settings
    const { data: settings, error } = await supabase
      .from('receptionist_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching receptionist settings:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    // Return settings or defaults
    return NextResponse.json({
      success: true,
      isPremium,
      settings: settings || {
        ...DEFAULT_RECEPTIONIST_SETTINGS,
        user_id: user.id,
      },
      hasSettings: !!settings,
    });

  } catch (error: any) {
    console.error('Receptionist settings GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST - Create or update receptionist settings
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has premium subscription
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const isPremium = userData?.subscription_tier === 'professional' || userData?.subscription_tier === 'premium';

    if (!isPremium) {
      return NextResponse.json({
        error: 'Receptionist Mode is a premium feature. Please upgrade to Professional plan.',
        upgradeRequired: true
      }, { status: 403 });
    }

    const input: ReceptionistSettingsInput = await req.json();

    // Validate business days if provided
    if (input.business_days) {
      const validDays = input.business_days.every(d => d >= 1 && d <= 7);
      if (!validDays) {
        return NextResponse.json({ error: 'Invalid business days. Must be 1-7 (Mon-Sun).' }, { status: 400 });
      }
    }

    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('receptionist_settings')
      .select('id')
      .eq('user_id', user.id)
      .single();

    let result;
    if (existingSettings) {
      // Update existing settings
      result = await supabase
        .from('receptionist_settings')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();
    } else {
      // Create new settings
      result = await supabase
        .from('receptionist_settings')
        .insert({
          user_id: user.id,
          ...DEFAULT_RECEPTIONIST_SETTINGS,
          ...input,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error saving receptionist settings:', result.error);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      settings: result.data,
      message: existingSettings ? 'Settings updated successfully' : 'Settings created successfully',
    });

  } catch (error: any) {
    console.error('Receptionist settings POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
