import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = "force-dynamic";

/**
 * User Settings API
 * Manage user profile, preferences, and integrations
 */

// GET - Fetch complete user settings
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Use the SQL function to get complete settings
    const { data: settings, error: settingsError } = await supabase
      .rpc('get_user_settings', { user_id_param: user.id });

    if (settingsError) {
      console.error('Error fetching user settings:', settingsError);
      return NextResponse.json({ ok: false, error: settingsError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      settings: settings || {},
    });

  } catch (error: any) {
    console.error('Error in GET /api/user/settings:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to fetch settings'
    }, { status: 500 });
  }
}

// PUT - Update user settings
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { profile, preferences } = body;

    let updatedUser = null;
    let updatedPreferences = null;

    // Update users table (profile settings)
    if (profile) {
      const userUpdates: any = {};

      if (profile.fullName !== undefined) userUpdates.full_name = profile.fullName;
      if (profile.phoneNumber !== undefined) userUpdates.phone_number = profile.phoneNumber;
      if (profile.businessName !== undefined) userUpdates.business_name = profile.businessName;
      if (profile.timezone !== undefined) userUpdates.timezone = profile.timezone;
      if (profile.notificationPreferences !== undefined) {
        userUpdates.notification_preferences = profile.notificationPreferences;
      }
      if (profile.defaultMessageSignature !== undefined) {
        userUpdates.default_message_signature = profile.defaultMessageSignature;
      }
      if (profile.businessHours !== undefined) {
        userUpdates.business_hours = profile.businessHours;
      }
      if (profile.autoReplyEnabled !== undefined) {
        userUpdates.auto_reply_enabled = profile.autoReplyEnabled;
      }
      if (profile.autoReplyMessage !== undefined) {
        userUpdates.auto_reply_message = profile.autoReplyMessage;
      }

      if (Object.keys(userUpdates).length > 0) {
        const { data, error: updateError } = await supabase
          .from('users')
          .update(userUpdates)
          .eq('id', user.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating user profile:', updateError);
          return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
        }

        updatedUser = data;
      }
    }

    // Update user_preferences table
    if (preferences) {
      const prefUpdates: any = {};

      if (preferences.theme !== undefined) prefUpdates.theme = preferences.theme;
      if (preferences.compactView !== undefined) prefUpdates.compact_view = preferences.compactView;
      if (preferences.itemsPerPage !== undefined) prefUpdates.items_per_page = preferences.itemsPerPage;
      if (preferences.defaultLeadStatus !== undefined) {
        prefUpdates.default_lead_status = preferences.defaultLeadStatus;
      }
      if (preferences.defaultLeadSource !== undefined) {
        prefUpdates.default_lead_source = preferences.defaultLeadSource;
      }
      if (preferences.autoScoreLeads !== undefined) {
        prefUpdates.auto_score_leads = preferences.autoScoreLeads;
      }
      if (preferences.requireMessageConfirmation !== undefined) {
        prefUpdates.require_message_confirmation = preferences.requireMessageConfirmation;
      }
      if (preferences.enableSmartReplies !== undefined) {
        prefUpdates.enable_smart_replies = preferences.enableSmartReplies;
      }
      if (preferences.autoCapitalize !== undefined) {
        prefUpdates.auto_capitalize = preferences.autoCapitalize;
      }
      if (preferences.enableAiSuggestions !== undefined) {
        prefUpdates.enable_ai_suggestions = preferences.enableAiSuggestions;
      }
      if (preferences.autoTagConversations !== undefined) {
        prefUpdates.auto_tag_conversations = preferences.autoTagConversations;
      }
      if (preferences.enableDuplicateDetection !== undefined) {
        prefUpdates.enable_duplicate_detection = preferences.enableDuplicateDetection;
      }

      // Twilio integration (don't return sensitive data)
      if (preferences.twilioPhoneNumber !== undefined) {
        prefUpdates.twilio_phone_number = preferences.twilioPhoneNumber;
      }
      if (preferences.twilioAccountSid !== undefined) {
        prefUpdates.twilio_account_sid = preferences.twilioAccountSid;
      }
      if (preferences.twilioAuthToken !== undefined) {
        // In production, encrypt this before storing
        prefUpdates.twilio_auth_token_encrypted = preferences.twilioAuthToken;
      }

      // Email integration
      if (preferences.emailProvider !== undefined) {
        prefUpdates.email_provider = preferences.emailProvider;
      }
      if (preferences.emailApiKey !== undefined) {
        // In production, encrypt this before storing
        prefUpdates.email_api_key_encrypted = preferences.emailApiKey;
      }

      if (Object.keys(prefUpdates).length > 0) {
        // Upsert preferences (create if not exists)
        const { data, error: updateError } = await supabase
          .from('user_preferences')
          .upsert({
            user_id: user.id,
            ...prefUpdates,
          }, {
            onConflict: 'user_id',
          })
          .select()
          .single();

        if (updateError) {
          console.error('Error updating user preferences:', updateError);
          return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
        }

        updatedPreferences = data;
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Settings updated successfully',
      user: updatedUser,
      preferences: updatedPreferences,
    });

  } catch (error: any) {
    console.error('Error in PUT /api/user/settings:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to update settings'
    }, { status: 500 });
  }
}
