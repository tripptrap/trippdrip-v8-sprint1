# Getting Started with TrippDrip

Welcome! This guide will get you sending SMS in under 5 minutes.

## Quick Start

### 1. Buy Your First Point Pack

1. Open **http://localhost:3000/points**
2. Choose a point pack:
   - **Starter**: 4,000 points ($40) - Good for testing
   - **Pro**: 10,000 points ($90) - Most popular
   - **Business**: 25,000 points ($212.50) - High volume
   - **Enterprise**: 60,000 points ($480) - Maximum value

3. Click **"Purchase"**
4. Complete payment via Stripe

**What happens automatically:**
- ✅ Points added to your account
- ✅ SMS account created (Twilio subaccount)
- ✅ Ready to purchase phone numbers
- ✅ Can start sending SMS immediately

### 2. Get a Phone Number

1. Go to **Settings → Phone Numbers**
2. Enter an area code (e.g., "415" for San Francisco)
3. Click **"Search Available Numbers"**
4. Browse available numbers
5. Click **"Purchase"** on your preferred number (~$1/month)
6. Number is instantly activated

### 3. Import Your Leads

1. Go to **Leads** page
2. Click **"Import"** or drag-and-drop a file
3. Supported formats:
   - CSV, Excel (.xlsx)
   - JSON
   - PDF (AI extracts data)
   - Word docs (.docx)

4. Leads are automatically:
   - Deduplicated
   - Phone numbers formatted (E.164)
   - Ready to message

### 4. Send Your First Campaign

**Option A: Quick Message**
1. Go to **Leads**
2. Select leads (checkboxes)
3. Click **"Bulk Actions" → "Send SMS"**
4. Type your message (use `{{first}}` for personalization)
5. Click **"Send"**

**Option B: Multi-Step Campaign**
1. Go to **Templates**
2. Click **"New Campaign"**
3. Use AI to generate flow or create manually
4. Set up message sequence
5. Tag your leads
6. Run campaign

### 5. Monitor & Optimize

- **Dashboard**: See overview stats
- **Messages**: View all conversations
- **Points**: Track usage and spending
- **Settings → Spam Protection**: Configure filters

## Points System

Points are used for every action:

| Action | Cost |
|--------|------|
| SMS sent | 1 point |
| AI response | 2 points |
| AI chat | 1 point |
| Flow generation | 5 points |
| Email sent | 0.5 points |

**Example:**
- Send 1,000 SMS = 1,000 points = ~$10 worth
- Generate 10 AI responses = 20 points
- Total: 1,020 points used

## Setup Requirements

### Required (Already Configured)
- ✅ OpenAI API key (in `.env.local`)
- ✅ Next.js development server

### Required for Production
- [ ] Master Twilio account (for creating user subaccounts)
- [ ] Stripe account (for real payments)
- [ ] Production database (currently using JSON files)

### Optional Enhancements
- [ ] User authentication (multi-user support)
- [ ] Email service integration
- [ ] Webhook for Twilio delivery reports
- [ ] Analytics dashboard

## Configuration

### Master Twilio Account

To enable automatic SMS account creation for users:

1. Get a Twilio account at [twilio.com](https://www.twilio.com/try-twilio)
2. Add to `.env.local`:
```env
TWILIO_MASTER_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_MASTER_AUTH_TOKEN=your_auth_token_here
```

### Stripe Integration

To enable real payments:

1. Get Stripe keys at [stripe.com](https://dashboard.stripe.com/apikeys)
2. Add to `.env.local`:
```env
STRIPE_SECRET_KEY=sk_test_your-key-here
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

3. Set up webhook endpoint:
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`

## How Points & SMS Work Together

### Payment Flow
```
User Buys Points ($40 for Starter)
         ↓
Stripe Payment Processed
         ↓
Twilio Account Created (if first purchase)
         ↓
4,000 Points Added
         ↓
User Can Purchase Phone Numbers
         ↓
Ready to Send SMS!
```

### Sending Flow
```
User Creates Campaign
         ↓
System Checks:
  ✓ Points balance (1 point per SMS)
  ✓ SMS account active
  ✓ Phone numbers configured
  ✓ Spam score < 70
         ↓
Messages Sent via Twilio
         ↓
Points Deducted
         ↓
Delivery Status Tracked (blue checkmarks)
```

## Cost Breakdown

### Your Costs (from Twilio master account)
- Phone numbers: $1/month each
- SMS sent: $0.0079 each
- SMS received: $0.0079 each

### User Pays (via points)
- SMS: 1 point = $0.01
- Markup: 26% ($0.0079 → $0.01)
- Your profit: ~$0.0021 per SMS

**Example:**
- User sends 1,000 SMS
- Your cost: $7.90 (Twilio)
- User pays: $10.00 (1,000 points)
- Your profit: $2.10

## Troubleshooting

### "SMS account not active"
→ Purchase any point pack to activate

### "No phone numbers found"
→ Try different area code or search without area code

### "Insufficient points"
→ Buy more points at `/points`

### "Twilio integration not configured"
→ Add master Twilio credentials to `.env.local`

### "Payment failed"
→ Check Stripe configuration in `.env.local`

## Common Workflows

### Workflow 1: Simple Bulk SMS
1. Import leads → CSV with name and phone
2. Select all leads → Check boxes
3. Send SMS → Type message, click send
4. Monitor → Check Messages page for replies

### Workflow 2: Drip Campaign
1. Create template → Multi-step sequence
2. Tag leads → Apply campaign tag
3. Run campaign → Automated sending
4. Track responses → View in Messages

### Workflow 3: AI-Powered Follow-ups
1. Lead responds → Shows in Messages
2. Click "Generate AI Response" → AI creates reply
3. Edit if needed → Personalize
4. Send → 2 points deducted

## Best Practices

### Avoid Spam Filters
- Use real, conversational language
- Personalize with `{{first}}` name
- Don't use ALL CAPS
- Limit links (max 2 per message)
- Avoid spam keywords (free money, click here, etc.)

### Optimize Costs
- Enable spam protection → Prevents wasted sends
- Use AI selectively → 2 points per generation
- Bulk purchases → Get discounts on larger packs
- Enable auto-refill → Never run out of points

### Scale Efficiently
- Import leads in bulk → Up to 10,000 at once
- Use templates → Save time
- Tag leads → Segment by interest
- Monitor delivery → Check blue checkmarks

## Next Steps

1. **Buy points** → Activate your SMS account
2. **Get a number** → Purchase in Settings
3. **Import leads** → CSV or Excel
4. **Send test message** → Verify it works
5. **Create campaign** → Use templates
6. **Monitor results** → Track in Dashboard

## Support & Resources

- **Documentation**: `/README.md`
- **Twilio Setup**: `/TWILIO_SETUP.md`
- **API Reference**: Check `/app/api/` folder
- **Troubleshooting**: See common issues above

## Development

The server should be running at:
- **Local**: http://localhost:3000
- **Points**: http://localhost:3000/points
- **Settings**: http://localhost:3000/settings
- **Leads**: http://localhost:3000/leads

## Questions?

1. Check the README.md for detailed docs
2. Review TWILIO_SETUP.md for SMS setup
3. Check browser console for errors
4. Verify `.env.local` has correct keys

Ready to send your first SMS? Let's go! 🚀
