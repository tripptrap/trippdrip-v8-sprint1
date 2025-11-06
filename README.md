# HyveWyre v8 - SMS Lead Management & Campaign System

A comprehensive lead management and SMS campaign platform built with Next.js, featuring AI-powered responses, points-based billing, Twilio integration, and spam protection.

## Features

### 🎯 Core Functionality

- **Lead Management**
  - Import leads from CSV, XLSX, PDF, DOCX files
  - AI-powered data extraction from unstructured documents
  - Phone number normalization (E.164 format)
  - State abbreviation conversion
  - Duplicate detection
  - Tag-based organization
  - Search and filter by name, email, phone, state, tags

- **SMS Campaigns**
  - Multi-step campaign workflows
  - Message personalization (`{{first}}`, `{{last}}`, `{{email}}`, etc.)
  - Twilio integration for actual SMS sending
  - Campaign templates with delays and scheduling
  - Lead filtering and segmentation
  - Real-time delivery tracking

- **AI Integration**
  - AI-powered response generation for leads
  - Conversation flow generator
  - Document parsing and data extraction
  - Context-aware messaging

- **Points & Billing System**
  - Usage-based points system
  - Transaction history tracking
  - Automated points deduction for actions:
    - SMS sent: 1 point
    - AI response: 2 points
    - AI chat: 1 point
    - Email: 0.5 points
    - Flow generation: 5 points
  - Stripe integration for point purchases
  - Auto-refill when balance low
  - Multiple pricing tiers

- **Spam Protection**
  - Real-time spam detection
  - Keyword filtering
  - Rate limiting (hourly/daily)
  - Message scoring system
  - Configurable blocking thresholds

- **Message Status Tracking**
  - Pending, sent, delivered, read, failed states
  - Blue checkmarks for sent messages (iMessage style)
  - Twilio delivery confirmation integration

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **AI**: OpenAI GPT-4o-mini
- **SMS**: Twilio
- **Payments**: Stripe
- **Storage**: File-based JSON (localStorage + server files)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Twilio account (for SMS)
- OpenAI API key (for AI features)
- Stripe account (for payments)

### Installation

1. **Clone the repository**
   ```bash
   cd /Applications/MAMP/htdocs/hyvewyre-v8-sprint1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env.local` file in the root directory:
   ```env
   # OpenAI API Key (required for AI features)
   OPENAI_API_KEY=sk-proj-your-key-here

   # Stripe Keys (required for payments)
   STRIPE_SECRET_KEY=sk_test_your-key-here
   STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

   # Base URL for redirects
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## Configuration

### 1. Twilio Setup (Automatic - Integrated with Payments)

**For Users:**
- SMS account is automatically created when you buy your first point pack
- No manual setup required
- Purchase points → SMS account created → Buy phone numbers → Start sending

**For Developers (Master Account Setup):**
1. Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Get your Account SID and Auth Token from Twilio Console
3. Add to `.env.local`:
   ```env
   TWILIO_MASTER_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_MASTER_AUTH_TOKEN=your_auth_token_here
   ```
4. Restart server
5. Users' SMS accounts will be created automatically on first purchase

### 2. Stripe Setup (Payments)

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your API keys from the Stripe Dashboard
3. Add them to your `.env.local` file
4. Set up webhook endpoint: `https://your-domain.com/api/stripe/webhook`
5. Configure webhook events: `checkout.session.completed`

### 3. Spam Protection

Go to **Settings → Spam Protection** to configure:
- Enable/disable spam detection
- Set message rate limits
- Configure blocking for high-risk messages

### 4. Auto-Refill Points

Go to **Settings → Auto-Refill** to configure:
- Enable automatic point top-up
- Set threshold (when to trigger refill)
- Set refill amount

## Usage Guide

### Getting Started (First Time Users)

1. **Buy Points & Activate SMS**
   - Go to **Points** page
   - Choose a point pack (Starter, Pro, Business, or Enterprise)
   - Complete payment
   - SMS account is automatically created
   - Points added to your balance

2. **Get a Phone Number**
   - Go to **Settings → Phone Numbers**
   - Search available numbers by area code
   - Purchase number (~$1/month)
   - Number is instantly activated

3. **Import Leads**
   - Go to **Leads** page
   - Upload CSV, Excel, PDF, or Word document
   - AI extracts and formats data automatically
   - Leads are deduplicated

4. **Send Your First Campaign**
   - Select leads
   - Create campaign template
   - Run campaign
   - System handles points, spam checking, and delivery

### Managing Points

**Point Packs:**
- Starter: 4,000 points - $40 (+ SMS account on first purchase)
- Pro: 10,000 points - $90 (10% off)
- Business: 25,000 points - $212.50 (15% off)
- Enterprise: 60,000 points - $480 (20% off)

**First Purchase Includes:**
- Points for sending messages
- Automatic SMS account creation
- Ability to purchase phone numbers
- Immediate access to all features

### Using AI Features

**AI Response Generator:**
1. Open a conversation with a lead
2. Click "Generate AI Response"
3. System generates contextual reply
4. Edit if needed, then send
5. Costs 2 points per generation

**AI Flow Generator:**
1. Go to **Templates** → "New Campaign"
2. Click "Generate with AI"
3. Provide context about your business
4. AI creates multi-step conversation flow
5. Costs 5 points per generation

## API Endpoints

### SMS Sending
- `POST /api/sms/send` - Send individual SMS
- `POST /api/campaigns/run` - Execute campaign

### AI
- `POST /api/ai` - General AI chat
- `POST /api/ai-response` - Generate lead response
- `POST /api/generate-flow` - Generate conversation flow

### Leads
- `GET /api/leads` - List/search leads
- `POST /api/leads/import` - Import leads
- `POST /api/leads/upsert` - Create/update lead
- `POST /api/ingest` - Parse uploaded files

### Payments
- `POST /api/stripe/create-checkout` - Create Stripe session
- `POST /api/stripe/webhook` - Handle Stripe webhooks

## Data Structure

### Leads (`data/leads.json`)
```json
{
  "id": "123",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+12345678901",
  "email": "john@example.com",
  "state": "CA",
  "tags": ["interested", "qualified"],
  "status": "active"
}
```

### Campaigns (`data/campaigns.json`)
```json
{
  "id": "cmp_123",
  "name": "Spring Sale",
  "created_at": "2025-01-01T00:00:00Z",
  "tags_applied": ["spring-sale"],
  "lead_ids": ["123", "456"],
  "lead_count": 2,
  "messages_sent": 2
}
```

### Points (localStorage: `userPoints`)
```json
{
  "balance": 1000,
  "transactions": [
    {
      "id": "tx_123",
      "type": "spend",
      "amount": -1,
      "description": "SMS sent (1x)",
      "timestamp": "2025-01-01T00:00:00Z",
      "actionType": "sms_sent"
    }
  ],
  "autoTopUp": true,
  "autoTopUpThreshold": 100,
  "autoTopUpAmount": 500
}
```

## Points Cost Reference

| Action | Cost |
|--------|------|
| SMS sent | 1 point |
| AI response | 2 points |
| AI chat message | 1 point |
| Email sent | 0.5 points |
| Flow generation | 5 points |

## Spam Protection Rules

The system checks for:
- Short messages (< 10 chars)
- Excessive capitalization (> 50%)
- Spam keywords (free money, click here, etc.)
- Too many links (> 2)
- High volume (> 100 recipients)
- Suspicious patterns ($$, !!!)

Spam scores:
- 0-29: Low risk ✅
- 30-49: Medium risk ⚠️
- 50-69: High risk 🔶
- 70+: Critical - Blocked 🚫

## Message Status Codes

- **Pending** ⏱ - Message queued
- **Sent** ✓ - Delivered to carrier (blue)
- **Delivered** ✓✓ - Received by recipient (blue)
- **Read** ✓✓ - Opened by recipient (blue)
- **Failed** ✗ - Delivery failed (red)

## Troubleshooting

### SMS not sending

1. Check Twilio credentials in Settings
2. Verify phone number is added in Settings → Phone Numbers
3. Ensure sufficient points balance
4. Check spam protection settings
5. Verify lead has valid phone number in E.164 format

### AI not working

1. Verify `OPENAI_API_KEY` in `.env.local`
2. Check points balance (needs 1-5 points depending on action)
3. Check browser console for errors

### Stripe payments not working

1. Verify `STRIPE_SECRET_KEY` in `.env.local`
2. Check Stripe Dashboard for errors
3. Ensure webhook is configured correctly
4. Use test mode keys for development

### Points not deducting

1. Check browser console for API errors
2. Verify endpoints are returning `pointsUsed` in response
3. Check localStorage for `userPoints` data
4. Try clearing cache and reloading

## Development

### Project Structure

```
/hyvewyre-v8-sprint1/
├── app/                      # Next.js pages and API routes
│   ├── api/                  # Backend API endpoints
│   │   ├── ai/              # AI chat endpoint
│   │   ├── campaigns/       # Campaign management
│   │   ├── leads/           # Lead CRUD operations
│   │   ├── sms/             # SMS sending
│   │   └── stripe/          # Payment processing
│   ├── leads/               # Leads management UI
│   ├── points/              # Points & billing UI
│   ├── settings/            # Settings UI
│   └── templates/           # Campaign templates UI
├── components/              # React components
├── lib/                     # Utilities and helpers
│   ├── pointsStore.ts       # Points management
│   ├── settingsStore.ts     # Settings management
│   ├── spamDetection.ts     # Spam detection logic
│   ├── storeOps.ts          # Message/thread operations
│   └── twilioClient.ts      # Twilio integration
├── data/                    # JSON data files
└── public/                  # Static assets
```

### Adding a New Action Type

1. Update `lib/pointsStore.ts`:
   ```typescript
   export const POINT_COSTS: Record<ActionType, number> = {
     // ... existing costs
     my_new_action: 3  // 3 points per action
   };
   ```

2. In your API route:
   ```typescript
   import { spendPointsForAction, canAffordAction } from '@/lib/pointsStore';

   if (!canAffordAction('my_new_action')) {
     return error response
   }

   // Do your action...

   spendPointsForAction('my_new_action');
   ```

## Security Considerations

### Production Deployment

Before deploying to production:

1. **Never commit sensitive keys**
   - Add `.env.local` to `.gitignore`
   - Use environment variables in production

2. **Use production API keys**
   - Twilio production credentials
   - Stripe live mode keys
   - OpenAI production key

3. **Implement user authentication**
   - Current version is single-user
   - Add Auth0, Supabase, or NextAuth for multi-user

4. **Use a real database**
   - Replace JSON files with PostgreSQL, MongoDB, etc.
   - Implement proper data persistence

5. **Add rate limiting**
   - Protect API endpoints from abuse
   - Use middleware for request throttling

6. **Enable HTTPS**
   - Required for Stripe webhooks
   - Use Vercel, Netlify, or similar hosting

## License

This project is proprietary software. All rights reserved.

## Support

For issues or questions:
1. Check this README
2. Review browser console for errors
3. Check API response errors
4. Verify all credentials are correct

## Roadmap

- [ ] User authentication & multi-tenancy
- [ ] PostgreSQL database migration
- [ ] Email campaign support
- [ ] Advanced analytics dashboard
- [ ] A/B testing for campaigns
- [ ] Webhook integrations
- [ ] Mobile app (React Native)
- [ ] WhatsApp integration
- [ ] CRM integrations (Salesforce, HubSpot)
- [ ] Advanced reporting and exports
