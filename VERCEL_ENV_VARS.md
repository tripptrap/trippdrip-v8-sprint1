# Environment Variables for Vercel

After deployment, add these environment variables in Vercel Dashboard:
Settings → Environment Variables

## Required Variables:

### Site Password Protection (CRITICAL - MUST ADD)
```
SITE_PASSWORD=90EJYFzWmtIJhz/kWeM+E5tD5mqXAERVrn4EskVL
```

### OpenAI (Already have this)
```
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE
```

### Database (Already have this)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trippdrip?schema=public
```

### NextAuth (Already have this)
```
NEXTAUTH_SECRET=your-nextauth-secret-key-change-this-in-production
NEXTAUTH_URL=https://YOUR-VERCEL-URL.vercel.app
```

### Base URL (Update with your Vercel URL)
```
NEXT_PUBLIC_BASE_URL=https://YOUR-VERCEL-URL.vercel.app
```

### Stripe (Need to add these - see Stripe setup instructions)
```
STRIPE_SECRET_KEY=sk_test_XXXXXXXXXXXXXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXX
```

### Twilio (Need to add these - see Twilio setup instructions)
```
TWILIO_MASTER_ACCOUNT_SID=ACXXXXXXXXXXXXXXXX
TWILIO_MASTER_AUTH_TOKEN=XXXXXXXXXXXXXXXX
```

---

## How to Add Variables to Vercel:

1. Go to: https://vercel.com/dashboard
2. Click on your project: `trippdrip`
3. Go to: Settings → Environment Variables
4. Add each variable:
   - Name: `OPENAI_API_KEY`
   - Value: `sk-proj-5B_w...`
   - Environment: Select "Production", "Preview", and "Development"
   - Click "Save"
5. Repeat for all variables
6. Redeploy: Go to Deployments → Click on latest → Click "Redeploy"

---

## Important Notes:

- **DATABASE_URL**: You may need to use a cloud database (Supabase, Neon, or Railway) instead of localhost
- **NEXTAUTH_URL**: Replace with your actual Vercel URL after deployment
- **NEXT_PUBLIC_BASE_URL**: Replace with your actual Vercel URL after deployment
- For Stripe/Twilio webhooks, use: `https://YOUR-VERCEL-URL.vercel.app/api/stripe/webhook`
