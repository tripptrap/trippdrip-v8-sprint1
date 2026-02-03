# HyveWyre Telephony Provider: Telnyx

This project uses **Telnyx** as its sole SMS and voice provider. All Twilio code has been removed.

## Remaining `twilio_` Column Names

The `sms_messages` database table still has columns named `twilio_status`, `twilio_error_message`, and `twilio_sid` for backward compatibility with existing data. These columns are used by Telnyx data — the names are legacy artifacts. A future migration can rename these to `provider_status`, `provider_error_message`, and `provider_sid`.

## Environment Variables

Required Telnyx configuration in `.env.local`:
- `TELNYX_API_KEY` — Your Telnyx API key
- `TELNYX_MESSAGING_PROFILE_ID` — Your Telnyx messaging profile ID
