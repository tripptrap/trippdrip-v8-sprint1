# TrustHub Setup Guide for HyveWyre

TrustHub is Twilio's compliance requirement for A2P (Application-to-Person) 10DLC messaging in the United States. This guide will help you register your business and get approved for higher throughput and better deliverability.

## What is TrustHub?

TrustHub verifies your business information to comply with carrier regulations for A2P messaging. Without TrustHub registration:
- Messages may be filtered or blocked by carriers
- Lower message throughput (1 msg/sec)
- Higher risk of number suspension

With TrustHub registration:
- Higher message throughput (60-4500 msg/sec depending on use case)
- Better deliverability rates
- Compliance with carrier regulations

## Business Information Required

### 1. Business Profile
```json
{
  "business_name": "HyveWyre",
  "business_type": "LLC",
  "business_registration_number": "YOUR_EIN_OR_TAX_ID",
  "business_registration_identifier": "EIN",
  "website": "https://hyvewyre.com",
  "business_regions_of_operation": ["US"],
  "business_industry": "Technology",
  "business_registration_date": "YYYY-MM-DD"
}
```

### 2. Business Address
```json
{
  "street": "12325 Magnolia Street",
  "city": "San Antonio",
  "state": "FL",
  "postal_code": "33576",
  "country": "US"
}
```

### 3. Authorized Representative
```json
{
  "first_name": "Tripp",
  "last_name": "Browning",
  "email": "tripp@hyvewyre.com",
  "phone_number": "+1XXXXXXXXXX",
  "job_title": "Developer & Authorized Representative"
}
```

### 4. Supporting Documents
You'll need to provide:
- **Business Registration Document** (Articles of Incorporation, LLC Certificate)
- **Tax ID Document** (IRS EIN Letter, W-9)
- **Business Address Proof** (Utility bill, Bank statement, Lease agreement)

## Step-by-Step Setup Process

### Step 1: Create a Business Profile in Twilio Console

1. Log in to [Twilio Console](https://console.twilio.com)
2. Navigate to **TrustHub** → **Business Profiles**
3. Click **Create new Business Profile**
4. Fill in business information:
   - Business Name: `HyveWyre`
   - Business Type: `LLC` or your actual business structure
   - EIN/Tax ID: Your business tax identification number
   - Website: `https://hyvewyre.com`
   - Industry: `Technology` or `Software/SaaS`
   - Business Address: `12325 Magnolia Street, San Antonio, FL 33576`

5. Add Authorized Representative:
   - Name: `Tripp Browning`
   - Email: `tripp@hyvewyre.com`
   - Phone: Your phone number
   - Title: `Developer & Authorized Representative`

6. Upload supporting documents (PDF format):
   - Business registration document
   - Tax ID document (EIN letter)
   - Proof of address

7. Submit for review (usually takes 2-7 business days)

### Step 2: Register a Brand (Campaign Registry)

After Business Profile is approved:

1. Navigate to **TrustHub** → **Brands**
2. Click **Register a new Brand**
3. Select your approved Business Profile
4. Fill in brand information:

```json
{
  "brand_name": "HyveWyre",
  "brand_type": "STARTER",
  "description": "AI-powered SMS communication platform for insurance agents, real estate professionals, and sales teams",
  "website": "https://hyvewyre.com",
  "vertical": "TECHNOLOGY",
  "ein": "YOUR_EIN",
  "stock_ticker": null,
  "russell_3000": false,
  "government_entity": false,
  "nonprofit": false
}
```

5. Submit for registration (costs $4 one-time fee)
6. Wait for approval (usually instant to 24 hours)

### Step 3: Create Messaging Services

After Brand is approved:

1. Navigate to **Messaging** → **Services**
2. Create a new Messaging Service or update existing one
3. Assign your approved Brand to the service
4. Configure sender pool (add your phone numbers)

### Step 4: Register Campaign Use Cases

For each type of messaging you do:

1. Navigate to **TrustHub** → **Campaigns**
2. Click **Create new Campaign**
3. Select your Brand
4. Choose use case type:

#### Use Case 1: Customer Care/Account Notifications
```json
{
  "use_case": "CUSTOMER_CARE",
  "description": "Account notifications, appointment reminders, status updates for insurance and real estate clients",
  "sample_messages": [
    "Hi [Name], your insurance quote is ready! Review it here: [link]",
    "Reminder: Your policy renewal is coming up on [date]. Reply to discuss options.",
    "Your appointment with [Agent] is confirmed for [date] at [time]."
  ],
  "message_volume": "10000",
  "opt_in_process": "Users opt-in by providing phone number when signing up or requesting information",
  "opt_out_process": "Users can reply STOP at any time to unsubscribe",
  "help_process": "Users can reply HELP for assistance. We provide contact information and support options"
}
```

#### Use Case 2: Marketing
```json
{
  "use_case": "MARKETING",
  "description": "Promotional campaigns for insurance products, real estate listings, and service offerings",
  "sample_messages": [
    "New listing alert! 3br/2ba home in [City] - [Price]. View photos: [link]",
    "Limited time: Get 15% off your home insurance quote. Call us today!",
    "Open house this Sunday! [Address] from 2-4pm. RSVP: [link]"
  ],
  "message_volume": "25000",
  "opt_in_process": "Explicit opt-in through website signup, lead forms, or SMS keyword subscription",
  "opt_out_process": "Reply STOP to opt-out. Opt-out processed immediately and confirmed.",
  "help_process": "Reply HELP for support. Contact info: support@hyvewyre.com"
}
```

5. Submit each campaign (costs $10/month per campaign)
6. Wait for approval (usually 3-5 business days)

## Integration with HyveWyre

### Update Environment Variables

After TrustHub approval, update your `.env.local`:

```bash
# Twilio TrustHub Configuration
TWILIO_BUSINESS_PROFILE_SID=BU...
TWILIO_BRAND_SID=BN...
TWILIO_MESSAGING_SERVICE_SID=MG...
TWILIO_CAMPAIGN_SID=CX...

# Use Messaging Service instead of individual numbers
TWILIO_USE_MESSAGING_SERVICE=true
```

### Update Twilio Configuration

Modify your Twilio client to use Messaging Service:

```typescript
// In lib/twilio.ts
const client = twilio(accountSid, authToken);

// Use Messaging Service SID instead of From number
await client.messages.create({
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
  to: toPhone,
  body: messageBody
});
```

## Sample Messages for Approval

### Customer Care Examples:
1. "Hi John! Your insurance quote request has been received. An agent will contact you within 24 hours."
2. "Your policy #12345 has been renewed. View details: https://portal.hyvewyre.com/policy"
3. "Reminder: Your appointment with Agent Smith is tomorrow at 2pm. Reply CONFIRM to acknowledge."
4. "Thank you for your payment of $150. Your policy is now active. Questions? Reply HELP"
5. "Your claim #98765 status has been updated to 'In Review'. Track progress: [link]"

### Marketing Examples:
1. "New home alert! 4br/3ba in Miami - $450k. Virtual tour: https://hyvewyre.com/listing/123"
2. "Save 20% on home insurance this month! Get your free quote: https://hyvewyre.com/quote"
3. "Just listed! Beautiful condo in downtown. Open house Sunday 2-4pm. RSVP: [link]"
4. "Your area home values are up 8%! Get a free home evaluation: [link]"
5. "Limited time offer: Bundle home + auto insurance and save $500/year. Learn more: [link]"

### Conversation/Flow Examples:
1. Agent: "Hi! I see you're interested in a home insurance quote. What type of property?"
2. Lead: "Single family home"
3. Agent: "Great! Is this your primary residence?"
4. Lead: "Yes"
5. Agent: "Perfect! I can get you a quote. What's your zip code?"

## Opt-In and Opt-Out Compliance

### Opt-In Language (for website/forms):
```
☑️ Yes, I'd like to receive text messages from HyveWyre about my account,
   appointments, and promotional offers. Message frequency varies.
   Message and data rates may apply. Reply STOP to unsubscribe, HELP for help.
```

### Help Response:
```
HyveWyre: Get help with insurance, real estate, and sales messaging.
Contact: support@hyvewyre.com or call 1-XXX-XXX-XXXX. Reply STOP to unsubscribe.
```

### Stop Response:
```
You've been unsubscribed from HyveWyre messages. You will not receive further
texts from this number. Text START to resubscribe or contact support@hyvewyre.com.
```

## Common Rejection Reasons and How to Avoid Them

### 1. Vague Use Case Description
❌ Bad: "We send messages to customers"
✅ Good: "We send appointment reminders, policy updates, and claim status notifications to insurance customers who have opted in via our web portal"

### 2. Missing Opt-In Process
❌ Bad: "Users sign up"
✅ Good: "Users explicitly opt-in by checking a consent box during account creation that clearly describes the types of messages they'll receive"

### 3. Sample Messages Too Generic
❌ Bad: "Hi, here's your info"
✅ Good: "Hi John! Your home insurance quote is ready: $1,200/year with $500 deductible. View full details: https://portal.hyvewyre.com/quote/12345"

### 4. Unclear Business Purpose
❌ Bad: "Technology company"
✅ Good: "SaaS platform providing SMS automation and lead management for insurance agents and real estate professionals"

## Fees and Costs

| Item | Cost | Frequency |
|------|------|-----------|
| Business Profile | Free | One-time |
| Brand Registration | $4 | One-time |
| Campaign Registration (Low Volume) | $10/mo | Per campaign |
| Campaign Registration (Standard) | $10/mo | Per campaign |
| Message throughput increase | Included | - |

## Expected Timeline

- Business Profile Approval: 2-7 business days
- Brand Registration: Instant to 24 hours
- Campaign Approval: 3-5 business days
- Total Time: 5-12 business days

## After Approval

### Benefits You'll Receive:
1. **Higher Throughput**: 60-4500 messages per second
2. **Better Deliverability**: Carriers trust verified businesses
3. **Brand Recognition**: Your business name appears on messages
4. **Compliance**: Meet all carrier requirements
5. **Lower Filtering**: Reduced spam filtering

### Monitoring:
- Check TrustHub dashboard regularly for compliance status
- Monitor message delivery rates in Twilio Console
- Keep business information up to date
- Renew campaigns annually ($10/mo continues)

## Troubleshooting

### Business Profile Stuck in "In Review"
- Contact Twilio Support with your Business Profile SID
- Verify all documents are clear and readable
- Ensure EIN matches business registration

### Campaign Rejected
- Review rejection reason in console
- Update use case description with more detail
- Provide clearer sample messages
- Ensure opt-in/opt-out processes are explicit
- Resubmit with changes

### Messages Still Being Filtered
- Verify campaign is approved and active
- Ensure messaging service is using correct campaign
- Check message content against campaign use case
- Review carrier filtering reports in console

## API Integration (Optional)

You can automate TrustHub setup via API:

```typescript
// Create Business Profile
const trusthub = require('twilio').trusthub;

const businessProfile = await client.trusthub.v1
  .trustProducts.create({
    friendlyName: 'HyveWyre Business Profile',
    email: 'tripp@hyvewyre.com',
    policySid: 'RN...' // Business Profile policy
  });

// Add business data
await client.trusthub.v1
  .trustProducts(businessProfile.sid)
  .trustProductsEntityAssignments.create({
    objectSid: 'customer_profile_sid'
  });
```

## Support

If you need help with TrustHub setup:
- Twilio Support: https://support.twilio.com
- TrustHub Documentation: https://www.twilio.com/docs/trust-hub
- A2P 10DLC Guide: https://www.twilio.com/docs/sms/a2p-10dlc

## Checklist

- [ ] Gather business documents (registration, tax ID, address proof)
- [ ] Create Business Profile in Twilio Console
- [ ] Upload supporting documents
- [ ] Wait for Business Profile approval
- [ ] Register Brand with Campaign Registry
- [ ] Create Messaging Service
- [ ] Register Campaign use cases
- [ ] Update environment variables
- [ ] Update code to use Messaging Service
- [ ] Test message delivery
- [ ] Monitor compliance status

---

**Last Updated**: 2025-01-17
**Status**: Ready for implementation
