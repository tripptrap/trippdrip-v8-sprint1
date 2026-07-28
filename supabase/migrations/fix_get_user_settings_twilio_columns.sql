-- Fix get_user_settings() referencing columns dropped by the Twilio removal.
--
-- 20260202_remove_twilio_tables_and_columns.sql dropped the columns but left
-- this function pointing at three of them, so every call raised
-- 42703 "column p.twilio_phone_number does not exist" and /api/user/settings
-- returned 500 on every dashboard page load (GitHub issue #28).
--
-- Removed, all verified absent from the live schema and unreferenced anywhere
-- in the app (no consumers of these keys exist in app/, components/ or lib/):
--   user_preferences.twilio_phone_number  -> 'has_twilio_configured'
--   user_settings.sms_provider            -> 'sms_provider'
--   user_settings.twilio_config           -> 'twilio_config'
--
-- SMS is Telnyx-only now, so a provider field would be meaningless anyway.

CREATE OR REPLACE FUNCTION public.get_user_settings(user_id_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'full_name', u.full_name,
      'phone_number', u.phone_number,
      'business_name', u.business_name,
      'timezone', u.timezone,
      'notification_preferences', u.notification_preferences,
      'default_message_signature', u.default_message_signature,
      'business_hours', u.business_hours,
      'auto_reply_enabled', u.auto_reply_enabled,
      'auto_reply_message', u.auto_reply_message,
      'credits', u.credits,
      'monthly_credits', u.monthly_credits,
      'subscription_tier', u.subscription_tier,
      'subscription_status', u.subscription_status,
      'plan_type', u.plan_type,
      'account_status', u.account_status,
      'onboarding_state', u.onboarding_state,
      'quiet_hours_enabled', u.quiet_hours_enabled,
      'quiet_hours_start', u.quiet_hours_start,
      'quiet_hours_end', u.quiet_hours_end,
      'auto_topup', u.auto_topup,
      'auto_topup_threshold', u.auto_topup_threshold,
      'auto_topup_amount', u.auto_topup_amount,
      'google_calendar_connected', u.google_calendar_refresh_token IS NOT NULL
    ),
    'preferences', jsonb_build_object(
      'theme', p.theme,
      'compact_view', p.compact_view,
      'items_per_page', p.items_per_page,
      'default_lead_status', p.default_lead_status,
      'default_lead_source', p.default_lead_source,
      'auto_score_leads', p.auto_score_leads,
      'require_message_confirmation', p.require_message_confirmation,
      'enable_smart_replies', p.enable_smart_replies,
      'auto_capitalize', p.auto_capitalize,
      'enable_ai_suggestions', p.enable_ai_suggestions,
      'auto_tag_conversations', p.auto_tag_conversations,
      'enable_duplicate_detection', p.enable_duplicate_detection,
      'has_email_configured', p.email_provider IS NOT NULL
    ),
    'provider_settings', jsonb_build_object(
      'email_config', s.email_config,
      'spam_protection', s.spam_protection,
      'auto_refill', s.auto_refill,
      'ai_settings', s.ai_settings,
      'opt_out_keyword', s.opt_out_keyword
    )
  ) INTO result
  FROM public.users u
  LEFT JOIN public.user_preferences p ON u.id = p.user_id
  LEFT JOIN public.user_settings s ON u.id = s.user_id
  WHERE u.id = user_id_param;

  RETURN result;
END;
$function$;
