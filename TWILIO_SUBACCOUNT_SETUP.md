# Twilio Multi-Tenant Subaccount Setup

## ✅ Completed Setup

### Database Migration
- ✅ Added subaccount columns to `user_preferences` table
- ✅ Created `user_twilio_numbers` table for tracking user phone numbers
- ✅ Added helper functions and RLS policies
- ✅ Verified with `node scripts/verify-twilio-setup.js`

### Code Implementation
1. **Library Files:**
   - `lib/twilioSubaccounts.ts` - Subaccount management functions
   - Updated `lib/twilio.ts` - Support for user-specific credentials

2. **API Endpoints:**
   - `POST /api/twilio/subaccount/provision` - Create subaccount for user
   - `GET /api/twilio/subaccount/provision` - Check subaccount status
   - `GET /api/twilio/numbers` - Fetch user's phone numbers
   - Updated `POST /api/sms/send` - Use user's subaccount credentials

3. **Webhook Integration:**
   - Updated Stripe webhook to auto-provision subaccounts on subscription purchase

4. **UI Components:**
   - Updated `SendSMSModal` to dynamically load user's phone numbers

## 🚀 Deployment Steps

### 1. Deploy to Vercel
```bash
git add .
git commit -m "Add Twilio multi-tenant subaccount architecture"
git push
npx vercel --prod
```

### 2. Set Vercel Environment Variables
Go to: https://vercel.com/your-project/settings/environment-variables

Add these if not already present:
- `TWILIO_ACCOUNT_SID` = [your Twilio master account SID]
- `TWILIO_AUTH_TOKEN` = [your Twilio auth token]
- `NEXT_PUBLIC_SUPABASE_URL` = [your Supabase URL]
- `SUPABASE_SERVICE_ROLE_KEY` = [your Supabase service role key]

## 🧪 Testing

### Test 1: Manual Subaccount Provision
In browser console (after logging in):
```javascript
fetch('/api/twilio/subaccount/provision', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(console.log)
```

Expected result: `{ success: true, subaccountSid: "AC...", friendlyName: "..." }`

### Test 2: Check Twilio Console
1. Go to: https://console.twilio.com/us1/develop/explore/subaccounts
2. You should see newly created subaccounts for each user

### Test 3: Subscription Purchase Flow
1. Make a test subscription purchase
2. Check logs for: "📱 Provisioning Twilio subaccount for user..."
3. Verify subaccount appears in Twilio console
4. Check database:
```sql
SELECT
  u.email,
  up.twilio_subaccount_sid,
  up.twilio_subaccount_status,
  up.twilio_subaccount_created_at
FROM users u
LEFT JOIN user_preferences up ON u.id = up.user_id
WHERE up.twilio_subaccount_sid IS NOT NULL;
```

### Test 4: SMS Sending
1. Open Send SMS modal
2. Should see user's phone numbers (or fallback to master numbers)
3. Send a test SMS
4. Check logs for: "🔐 Using user-specific Twilio subaccount"

## 📊 How It Works

### User Flow:
1. **User purchases subscription** → Stripe webhook fires
2. **Webhook creates Twilio subaccount** → Stored in `user_preferences`
3. **User purchases phone numbers** → Added to `user_twilio_numbers` table
4. **User sends SMS** → System uses their subaccount credentials
5. **Billing isolated** → Each user's usage bills to their subaccount

### Fallback Behavior:
- If user has no subaccount: Uses master account
- If user has no phone numbers: Shows master account numbers with notice
- Graceful degradation ensures service continuity

## 🔧 Future Enhancements

### Needed:
1. **Phone Number Management UI**
   - Allow users to purchase Twilio numbers from app
   - Sync purchased numbers to `user_twilio_numbers` table
   - Set primary number

2. **Encryption**
   - Currently auth tokens stored as plain text
   - Implement encryption for `twilio_subaccount_auth_token_encrypted`

3. **Admin Dashboard**
   - View all subaccounts
   - Manually provision for existing users
   - Monitor usage and billing

4. **Webhooks from Twilio**
   - Auto-sync phone number purchases
   - Track usage and costs
   - Handle subaccount status changes

## 📝 Database Schema Reference

### user_preferences (new columns)
```sql
twilio_subaccount_sid VARCHAR(100)
twilio_subaccount_auth_token_encrypted TEXT
twilio_subaccount_status VARCHAR(50) DEFAULT 'pending'
twilio_subaccount_created_at TIMESTAMP WITH TIME ZONE
twilio_subaccount_friendly_name VARCHAR(255)
```

### user_twilio_numbers (new table)
```sql
id UUID PRIMARY KEY
user_id UUID (FK to auth.users)
phone_number VARCHAR(20) NOT NULL
phone_sid VARCHAR(100) NOT NULL
friendly_name VARCHAR(255)
capabilities JSONB
is_primary BOOLEAN DEFAULT false
status VARCHAR(50) DEFAULT 'active'
purchased_at TIMESTAMP
```

## 🆘 Troubleshooting

### Issue: "No Twilio subaccount found for this user"
- User needs to purchase a subscription first
- Or manually provision via `/api/twilio/subaccount/provision`

### Issue: "Twilio client not initialized"
- Check environment variables in Vercel
- Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set

### Issue: Subaccount creation fails
- Verify master account has subaccount permissions
- Check Twilio account status is "active"
- Contact Twilio support if needed

### Issue: Phone numbers not showing
- User needs to purchase numbers via Twilio console
- Numbers must be added to `user_twilio_numbers` table
- Fallback shows master account numbers

## 📞 Support Resources

- Twilio Subaccounts Docs: https://www.twilio.com/docs/iam/api/subaccounts
- Twilio Console: https://console.twilio.com
- Supabase Dashboard: https://supabase.com/dashboard
- Verification Script: `node scripts/verify-twilio-setup.js`
