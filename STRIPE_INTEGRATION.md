# Stripe Payment Integration

This application includes Stripe payment integration for purchasing credits.

## Setup Requirements

### Environment Variables

**Required for Production:**
```bash
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
NEXT_PUBLIC_BASE_URL=https://your-domain.com
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**For Testing (Development):**
```bash
STRIPE_SECRET_KEY=sk_test_your_test_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_test_webhook_secret
NEXT_PUBLIC_BASE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Stripe Configuration

1. **Create a Stripe Account**: Sign up at https://stripe.com
2. **Get API Keys**: Find them in the Stripe Dashboard under Developers > API Keys
3. **Set Up Webhook Endpoint**:
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`

### Database Setup

1. Run the `supabase-payments-table.sql` migration in your Supabase project
2. Ensure the `users` table has these columns:
   - `credits` (integer)
   - `monthly_credits` (integer)
   - `plan_type` (varchar)

## Testing with Stripe Test Mode

Use Stripe's test mode for development:

1. **Use Test API Keys** (start with `sk_test_`)
2. **Test Cards**:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Requires Authentication: `4000 0025 0000 3155`
   - More test cards: https://stripe.com/docs/testing

## Payment Flow

1. User clicks "Purchase" button
2. Stripe checkout session created via API
3. User redirected to Stripe payment page
4. User enters card details
5. On successful payment, Stripe webhook fires
6. Webhook handler updates user credits in database
7. User redirected back with success message

## API Endpoints

### POST /api/stripe/create-checkout

Creates a Stripe checkout session.

**Request Body:**
```json
{
  "points": 1000,
  "price": 29.00,
  "packName": "Basic Plan",
  "planType": "basic"
}
```

**Response:**
```json
{
  "ok": true,
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

### POST /api/stripe/webhook

Handles Stripe webhook events to update credits after successful payment.

**Events Handled:**
- `checkout.session.completed` - Updates user credits and creates payment record
- `payment_intent.succeeded` - Logs successful payment
- `payment_intent.payment_failed` - Creates failed payment record

## Security Notes

- All API keys stored in environment variables
- Webhook signature verification enabled for all requests
- RLS policies ensure users can only see their own payments
- Service role key used for webhook (bypasses RLS for system operations)
- All payments logged in database with full audit trail

## Troubleshooting

### Payments Not Processing

1. **Check API Keys**: Verify `STRIPE_SECRET_KEY` is set correctly
2. **Test Webhook Locally**: Use Stripe CLI to forward webhooks
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
3. **Check Logs**: Review console for error messages

### Webhook Not Firing

1. **Verify Endpoint**: Check webhook URL is publicly accessible
2. **Check Secret**: Ensure `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
3. **Review Events**: Check Stripe dashboard for webhook delivery attempts

### Credits Not Updating

1. **Check Console Logs**: Look for database errors
2. **Verify User Table**: Ensure `credits`, `monthly_credits`, `plan_type` columns exist
3. **Check RLS Policies**: Verify policies on `users` and `payments` tables
4. **Service Role Key**: Confirm `SUPABASE_SERVICE_ROLE_KEY` is set

## Payment Records

All transactions are stored in the `payments` table with:
- Transaction amount and currency
- Payment status (completed, failed, pending)
- Credits purchased
- Plan type and pack name
- Stripe session ID and payment intent
- Timestamps for audit trail
