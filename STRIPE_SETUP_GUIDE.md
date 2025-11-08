# HyveWyre Stripe Setup Guide (Test Mode)

## Products to Create in Stripe Dashboard

### 1. Go to Stripe Test Dashboard
**URL**: https://dashboard.stripe.com/test/products

---

## Subscription Products

### Product 1: Basic Plan
- **Name**: HyveWyre Basic Plan
- **Description**: 1,000 points monthly subscription
- **Pricing Model**: Recurring
- **Price**: $30.00 USD
- **Billing Period**: Monthly
- **Tax Behavior**: Taxable (or as needed)

📋 **After creating, copy the Price ID** (starts with `price_...`)

---

### Product 2: Premium Plan
- **Name**: HyveWyre Premium Plan
- **Description**: 10,000 points monthly subscription
- **Pricing Model**: Recurring
- **Price**: $98.00 USD
- **Billing Period**: Monthly
- **Tax Behavior**: Taxable (or as needed)

📋 **After creating, copy the Price ID** (starts with `price_...`)

---

## One-Time Point Packs

### Product 3: Starter Pack
- **Name**: 4,000 Points - Starter Pack
- **Description**: One-time purchase of 4,000 points
- **Pricing Model**: One time
- **Price**: $40.00 USD

📋 **After creating, copy the Price ID**

---

### Product 4: Pro Pack
- **Name**: 10,000 Points - Pro Pack
- **Description**: One-time purchase of 10,000 points (5% off)
- **Pricing Model**: One time
- **Price**: $95.00 USD

📋 **After creating, copy the Price ID**

---

### Product 5: Business Pack
- **Name**: 25,000 Points - Business Pack
- **Description**: One-time purchase of 25,000 points (10% off)
- **Pricing Model**: One time
- **Price**: $225.00 USD

📋 **After creating, copy the Price ID**

---

### Product 6: Enterprise Pack
- **Name**: 60,000 Points - Enterprise Pack
- **Description**: One-time purchase of 60,000 points (15% off)
- **Pricing Model**: One time
- **Price**: $510.00 USD

📋 **After creating, copy the Price ID**

---

## After Creating All Products

Paste all the Price IDs here:

```
BASIC_PLAN_PRICE_ID=price_________________
PREMIUM_PLAN_PRICE_ID=price_________________
STARTER_PACK_PRICE_ID=price_________________
PRO_PACK_PRICE_ID=price_________________
BUSINESS_PACK_PRICE_ID=price_________________
ENTERPRISE_PACK_PRICE_ID=price_________________
```

---

## Testing with Stripe Test Cards

Once set up, use these test cards:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Requires Auth**: `4000 0025 0000 3155`

- **Expiry**: Any future date (e.g., 12/25)
- **CVC**: Any 3 digits (e.g., 123)
- **ZIP**: Any 5 digits (e.g., 12345)

---

## Webhook Configuration

Your webhook is already configured with endpoint:
- **URL**: `https://your-domain.com/api/stripe/webhook`
- **Secret**: `whsec_4dc3d7bf8974a63d0446c8ed7b35918b79959021bbba9d68f7555b98e744a3d8`

Events to listen for:
- ✓ `checkout.session.completed`
- ✓ `customer.subscription.updated`
- ✓ `customer.subscription.deleted`
