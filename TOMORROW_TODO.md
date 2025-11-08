# Tomorrow's Stripe Integration Tasks

## What We Need to Complete

### 1. Create Stripe Products (30 minutes)
**URL**: https://dashboard.stripe.com/test/products

**Create These 10 Products:**

#### Subscriptions (2)
- [ ] Basic Plan - $30/month recurring → Save Price ID: `________________`
- [ ] Premium Plan - $98/month recurring → Save Price ID: `________________`

#### Point Packs - Basic Pricing (4)
- [ ] Starter (4k pts) - $40 → Save Price ID: `________________`
- [ ] Pro (10k pts) - $95 → Save Price ID: `________________`
- [ ] Business (25k pts) - $225 → Save Price ID: `________________`
- [ ] Enterprise (60k pts) - $510 → Save Price ID: `________________`

#### Point Packs - Premium Pricing (4)
- [ ] Starter (4k pts) - $36 → Save Price ID: `________________`
- [ ] Pro (10k pts) - $80 → Save Price ID: `________________`
- [ ] Business (25k pts) - $187.50 → Save Price ID: `________________`
- [ ] Enterprise (60k pts) - $420 → Save Price ID: `________________`

---

### 2. Update Code with Price IDs
Once you have all 10 Price IDs, paste them into Claude and I'll:
- Update the points page
- Update the checkout API
- Configure the settings page

---

### 3. Test Everything
Using Stripe test card: `4242 4242 4242 4242`

**Test Scenarios:**
- [ ] Sign up for Basic plan ($30)
- [ ] Sign up for Premium plan ($98)
- [ ] Buy Starter pack as Basic member ($40)
- [ ] Buy Starter pack as Premium member ($36) - verify discount
- [ ] Upgrade from Basic to Premium
- [ ] Downgrade from Premium to Basic
- [ ] Verify points are added after purchase
- [ ] Check webhook logs for payment events

---

## Current Status

### ✅ Completed
- Stripe SDK installed
- API keys configured in `.env.local`
- Webhook secret configured
- `/api/stripe/create-checkout` endpoint built
- `/api/stripe/webhook` endpoint built
- Points page UI ready
- Settings page ready
- Discount logic implemented

### ⏳ Remaining
- Create 10 Stripe products
- Add Price IDs to code
- End-to-end testing

---

## Quick Start Tomorrow

1. Open this file
2. Go to Stripe dashboard
3. Create the 10 products
4. Paste Price IDs to Claude
5. Test the flow
6. Done!

**Estimated Time**: 1-2 hours total
