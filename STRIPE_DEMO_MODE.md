# Stripe Payment Integration with Demo Mode

This application includes a Stripe payment integration with built-in demo mode for testing.

## Demo Mode

Demo mode is **automatically enabled** in development (`NODE_ENV=development`) or when `STRIPE_DEMO_MODE=true` is set in your environment variables.

### How Demo Mode Works

When demo mode is active:
- ✅ No real Stripe API calls are made
- ✅ Credits are immediately added to the user's account
- ✅ Payment records are created with `status: 'demo_completed'`
- ✅ No credit card information is required
- ✅ Perfect for testing the payment flow

### Using Demo Mode

1. **Automatic (Development)**: Demo mode is enabled by default when running locally
2. **Manual**: Set environment variable `STRIPE_DEMO_MODE=true`

Example `.env.local`:
```bash
STRIPE_DEMO_MODE=true
NODE_ENV=development
```

## Production Mode

For production deployments, ensure:

1. **Environment Variables**:
   ```bash
   STRIPE_SECRET_KEY=sk_live_your_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   NEXT_PUBLIC_BASE_URL=https://your-domain.com
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. **Stripe Configuration**:
   - Create a Stripe account at https://stripe.com
   - Get your live API keys from the Stripe Dashboard
   - Set up webhook endpoint: `https://your-domain.com/api/stripe/webhook`
   - Configure webhook to listen for: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`

3. **Database Setup**:
   - Run the `supabase-payments-table.sql` migration in your Supabase project
   - Ensure the `users` table has columns: `credits`, `monthly_credits`, `plan_type`

## Testing with Stripe Test Mode

Even in production, you can use Stripe's test mode:

1. Use test API keys (start with `sk_test_`)
2. Use test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - More test cards: https://stripe.com/docs/testing

## Payment Flow

### Demo Mode Flow:
1. User clicks "Purchase" button
2. Credits are immediately added to their account
3. Payment record created with `demo_completed` status
4. Success message displayed

### Real Mode Flow:
1. User clicks "Purchase" button
2. Stripe checkout session created
3. User redirected to Stripe payment page
4. User enters card details
5. On successful payment, Stripe webhook fires
6. Webhook handler updates user credits in database
7. User redirected back with success message

## API Endpoints

### POST /api/stripe/create-checkout
Creates a checkout session or processes demo payment.

**Request Body:**
```json
{
  "points": 1000,
  "price": 29.00,
  "packName": "Basic Plan",
  "planType": "basic"
}
```

**Demo Response:**
```json
{
  "ok": true,
  "demo": true,
  "message": "Demo payment completed successfully",
  "credits": 1000,
  "points": 1000,
  "packName": "Basic Plan"
}
```

**Real Response:**
```json
{
  "ok": true,
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

### POST /api/stripe/webhook
Handles Stripe webhook events (production only).

## Security Notes

- Demo mode should **never** be enabled in production
- Use environment variables for all sensitive keys
- Webhook signature verification is enabled in production
- RLS policies ensure users can only see their own payments
- Service role key is used for webhook (bypasses RLS)

## Troubleshooting

### Demo mode not working:
- Check `NODE_ENV` is set to `development`
- Or verify `STRIPE_DEMO_MODE=true` in environment

### Real payments not working:
- Verify Stripe API keys are set correctly
- Check webhook endpoint is accessible
- Verify webhook secret matches Stripe dashboard
- Check Supabase service role key is set

### Credits not updating:
- Check console logs for errors
- Verify `users` table has correct columns
- Check RLS policies on `users` and `payments` tables
