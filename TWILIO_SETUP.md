# Twilio Automatic Account Creation Setup

This guide explains how to set up automatic Twilio account creation for your users.

## Overview

When a user clicks "Create Twilio Account Now" in Settings, the system will:
1. Create a new Twilio subaccount under your master account
2. Automatically save the Account SID and Auth Token
3. Enable the user to purchase phone numbers directly through the UI

## Setup Instructions

### Step 1: Get Your Master Twilio Account

1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up for a Twilio account (this will be your master account)
3. Verify your account and add a payment method

### Step 2: Get Your Master Credentials

1. Go to the [Twilio Console](https://console.twilio.com)
2. Find your **Account SID** and **Auth Token** on the dashboard
3. Copy both values

### Step 3: Add to Environment Variables

Open `/Applications/MAMP/htdocs/trippdrip-v8-sprint1/.env.local` and add:

```env
TWILIO_MASTER_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_MASTER_AUTH_TOKEN=your_auth_token_here
```

Replace with your actual values.

### Step 4: Restart Your Server

Stop and restart your Next.js development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## How It Works

### Subaccounts

Twilio allows you to create subaccounts under a master account. Each subaccount:
- Has its own Account SID and Auth Token
- Has its own phone numbers
- Has separate billing (billed to the master account)
- Is isolated from other subaccounts

### User Flow

1. **User clicks "Create Twilio Account Now"**
   - POST request to `/api/twilio/create-account`
   - Server creates subaccount using master credentials
   - New Account SID and Auth Token are returned
   - Credentials are saved to localStorage

2. **User searches for phone numbers**
   - POST request to `/api/twilio/search-numbers`
   - Searches available numbers in specified area code
   - Returns list of available numbers with capabilities

3. **User purchases a number**
   - POST request to `/api/twilio/purchase-number`
   - Number is purchased to the user's subaccount
   - Number SID and details are saved
   - User can now send SMS from this number

4. **User releases a number**
   - POST request to `/api/twilio/release-number`
   - Number is released from the subaccount
   - Billing stops for that number

## Cost Structure

### Master Account
- No monthly fee
- Pay-as-you-go for subaccount usage
- All subaccount charges roll up to master account

### Phone Numbers
- US/Canada: ~$1.00/month per number
- UK: ~$1.50/month per number
- Other countries: varies

### SMS Costs (billed to master account)
- US: $0.0079 per SMS sent
- US: $0.0079 per SMS received
- International: varies by country

## Security Considerations

### DO NOT share your master credentials
- Master credentials have full access to all subaccounts
- Keep them secure in `.env.local` (never commit to git)
- Only use them server-side (never expose to client)

### Production Deployment
- Use environment variables in your hosting platform
- Never hardcode credentials in code
- Rotate credentials periodically

### Subaccount Isolation
- Each user gets their own subaccount
- Users cannot access other users' accounts
- Billing is consolidated to master account

## Testing

### Test the Flow

1. Go to [http://localhost:3000/settings](http://localhost:3000/settings)
2. Click "SMS Provider" tab
3. Click "Create Twilio Account Now"
4. Should see "Twilio Account Connected" message
5. Click "Phone Numbers" tab
6. Enter area code (e.g., "415")
7. Click "Search Available Numbers"
8. Should see list of available numbers
9. Click "Purchase" on any number
10. Number should appear in "Your Phone Numbers" section

### Verify in Twilio Console

1. Go to [Twilio Console](https://console.twilio.com)
2. Click "Account" → "Subaccounts"
3. Should see newly created subaccount
4. Click on the subaccount
5. Go to "Phone Numbers" → "Manage" → "Active Numbers"
6. Should see purchased number

## Troubleshooting

### "Twilio master account not configured"
- Make sure `TWILIO_MASTER_ACCOUNT_SID` and `TWILIO_MASTER_AUTH_TOKEN` are in `.env.local`
- Restart your development server
- Check that values don't have extra spaces or quotes

### "Failed to create Twilio account"
- Check that your master account is verified
- Make sure you have a payment method added
- Check that your account isn't suspended
- Verify credentials are correct

### "Failed to search phone numbers"
- Subaccount may not be fully activated yet (wait 1-2 minutes)
- Try a different area code
- Make sure subaccount has billing enabled

### "Failed to purchase phone number"
- Number may have just been purchased by someone else
- Search again for different numbers
- Check Twilio account balance/billing

### Phone number not showing in Twilio Console
- Refresh the console page
- Check the correct subaccount (not master account)
- Wait a few seconds for propagation

## API Endpoints

### Create Subaccount
```
POST /api/twilio/create-account
Body: { friendlyName: "User Account Name" }
Returns: { accountSid, authToken, friendlyName, status, dateCreated }
```

### Search Available Numbers
```
POST /api/twilio/search-numbers
Body: {
  accountSid: "ACxxx",
  authToken: "xxx",
  countryCode: "US",
  areaCode: "415" (optional),
  contains: "1234" (optional)
}
Returns: { success: true, numbers: [...], total: 50 }
```

### Purchase Phone Number
```
POST /api/twilio/purchase-number
Body: {
  accountSid: "ACxxx",
  authToken: "xxx",
  phoneNumber: "+14155551234"
}
Returns: { success: true, phoneNumber, sid, friendlyName, capabilities }
```

### Release Phone Number
```
POST /api/twilio/release-number
Body: {
  accountSid: "ACxxx",
  authToken: "xxx",
  phoneSid: "PNxxx"
}
Returns: { success: true, message: "Phone number released successfully" }
```

## Alternative: Manual Setup

If you don't want to use automatic account creation, users can:

1. Create their own Twilio account at twilio.com
2. Get their own Account SID and Auth Token
3. Go to Settings → Phone Numbers tab
4. Manually enter their credentials
5. Use the number search and purchase features with their own account

## Production Considerations

### Multi-Tenant Application

For a production multi-tenant app:
1. Store subaccount credentials in a database (encrypted)
2. Associate credentials with user ID
3. Load credentials from database instead of localStorage
4. Implement user authentication
5. Add billing integration to charge users

### Cost Tracking

Track costs per user:
```typescript
// Example: Track SMS costs
const smsCount = await getUserSMSCount(userId);
const cost = smsCount * 0.0079; // $0.0079 per SMS
const markup = cost * 1.5; // 50% markup
const chargeUser = markup;
```

### Rate Limiting

Prevent abuse:
- Limit subaccount creations per IP/user
- Limit phone number purchases per day
- Monitor for suspicious activity
- Implement spending limits per subaccount

## Support

If you encounter issues:
1. Check Twilio Console for error messages
2. Check server logs for API errors
3. Verify all credentials are correct
4. Contact Twilio support if account-related
5. Check this app's logs at `/Applications/MAMP/logs`

## Additional Resources

- [Twilio Subaccounts Documentation](https://www.twilio.com/docs/iam/api/subaccounts)
- [Twilio Phone Numbers API](https://www.twilio.com/docs/phone-numbers/api)
- [Twilio Pricing](https://www.twilio.com/pricing)
- [Twilio Security Best Practices](https://www.twilio.com/docs/usage/security)
