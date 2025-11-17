# Service Email Documentation

HyveWyre's service email system provides beautiful, branded transactional emails for common platform events.

## Features

- **8 Pre-built Email Templates**
- **Professional HTML Design** with responsive layout
- **Plain Text Fallback** for email clients that don't support HTML
- **Easy Integration** with simple helper functions
- **Email Tracking** in database for analytics
- **Multiple Provider Support** (SMTP, SendGrid)

## Available Email Types

### 1. Welcome Email
Sent when a new user signs up.

```typescript
import { serviceEmail } from '@/lib/serviceEmail';

await serviceEmail.sendWelcomeEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  loginUrl: 'https://hyvewyre.com/dashboard'
});
```

### 2. Password Reset Email
Sent when a user requests a password reset.

```typescript
await serviceEmail.sendPasswordResetEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  resetUrl: 'https://hyvewyre.com/reset-password?token=abc123',
  expiresIn: '1 hour' // optional, defaults to '1 hour'
});
```

### 3. Email Verification
Sent to verify a user's email address.

```typescript
await serviceEmail.sendEmailVerificationEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  verifyUrl: 'https://hyvewyre.com/verify?token=abc123'
});
```

### 4. Low Points Warning
Sent when a user's points balance is running low.

```typescript
await serviceEmail.sendLowPointsWarningEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  currentPoints: 50
});
```

### 5. Campaign Completed
Sent when a bulk SMS campaign finishes.

```typescript
await serviceEmail.sendCampaignCompletedEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  campaignName: 'Q1 Promotion',
  stats: {
    sent: 1000,
    delivered: 980,
    failed: 20
  }
});
```

### 6. Monthly Summary
Sent monthly with user activity statistics.

```typescript
await serviceEmail.sendMonthlySummaryEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  stats: {
    messagesSent: 5420,
    leadsAdded: 234,
    conversationsStarted: 189,
    responseRate: 42
  }
});
```

### 7. Account Suspended
Sent when an account is suspended.

```typescript
await serviceEmail.sendAccountSuspendedEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  reason: 'Violation of terms of service - spam complaints'
});
```

### 8. Payment Failed
Sent when a payment fails to process.

```typescript
await serviceEmail.sendPaymentFailedEmail({
  to: 'user@example.com',
  userName: 'John Doe',
  amount: 49.99,
  retryUrl: 'https://hyvewyre.com/points'
});
```

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```bash
# Email Provider (smtp or sendgrid)
SERVICE_EMAIL_PROVIDER=smtp

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Or SendGrid Configuration
SENDGRID_API_KEY=your-sendgrid-api-key

# From Address
SERVICE_EMAIL_FROM=noreply@hyvewyre.com
SERVICE_EMAIL_FROM_NAME=HyveWyre

# System API Key (for cron jobs)
SYSTEM_API_KEY=your-secret-key

# App URL
NEXT_PUBLIC_APP_URL=https://hyvewyre.com
```

### Gmail SMTP Setup

1. Enable 2-Factor Authentication on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Create a new App Password for "Mail"
4. Use this password in `SMTP_PASSWORD`

### SendGrid Setup

1. Create a SendGrid account at https://sendgrid.com
2. Generate an API key with "Mail Send" permission
3. Set `SERVICE_EMAIL_PROVIDER=sendgrid`
4. Add your API key to `SENDGRID_API_KEY`

## Database Migration

Run the migration to create the `service_emails` table:

```sql
-- In Supabase SQL Editor
-- Run: supabase/migrations/add_service_emails.sql
```

This creates:
- `service_emails` table for tracking sent emails
- Indexes for fast queries
- RLS policies for security
- `get_service_email_stats()` function for analytics

## API Usage

You can also call the API directly:

```bash
curl -X POST https://hyvewyre.com/api/email/service \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-system-api-key" \
  -d '{
    "type": "welcome",
    "to": "user@example.com",
    "data": {
      "userName": "John Doe",
      "loginUrl": "https://hyvewyre.com/dashboard"
    }
  }'
```

## Usage Examples

### Send Welcome Email on Signup

```typescript
// In your signup route
const result = await serviceEmail.sendWelcomeEmail({
  to: email,
  userName: `${firstName} ${lastName}`,
  loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
});

if (!result.ok) {
  console.error('Failed to send welcome email:', result.error);
}
```

### Send Low Points Warning

```typescript
// In your cron job or points checking logic
const userPoints = await getUserPoints(userId);

if (userPoints < 100) {
  const user = await getUser(userId);

  await serviceEmail.sendLowPointsWarningEmail({
    to: user.email,
    userName: user.name,
    currentPoints: userPoints
  });
}
```

### Send Campaign Completed Notification

```typescript
// After campaign finishes
const campaignStats = await getCampaignStats(campaignId);

await serviceEmail.sendCampaignCompletedEmail({
  to: user.email,
  userName: user.name,
  campaignName: campaign.name,
  stats: {
    sent: campaignStats.totalSent,
    delivered: campaignStats.delivered,
    failed: campaignStats.failed
  }
});
```

## Email Analytics

Query email stats from the database:

```typescript
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();

// Get email stats for a user
const { data } = await supabase.rpc('get_service_email_stats', {
  p_user_id: userId,
  p_days_back: 30
});

console.log('Total sent:', data.total_sent);
console.log('Total opened:', data.total_opened);
console.log('By type:', data.by_type);
console.log('Recent emails:', data.recent_emails);
```

## Customization

To customize email templates, edit `/lib/emailTemplates.ts`:

```typescript
// Change brand color
const BRAND_COLOR = '#3b82f6'; // Your brand color

// Change company info
const BRAND_NAME = 'HyveWyre';
const SUPPORT_EMAIL = 'support@hyvewyre.com';
const COMPANY_ADDRESS = '12325 Magnolia Street, San Antonio, Florida 33576';
```

## Testing

Test emails in development:

```typescript
// Create a test route
export async function GET() {
  const result = await serviceEmail.sendWelcomeEmail({
    to: 'test@example.com',
    userName: 'Test User'
  });

  return Response.json(result);
}
```

## Troubleshooting

### Emails not sending

1. Check environment variables are set correctly
2. Verify SMTP credentials
3. Check email provider logs
4. Review `service_emails` table for error messages

### Gmail blocks sign-in

- Enable "Less secure app access" or use App Passwords
- Check Gmail security settings
- Verify 2FA is enabled and App Password is created

### SendGrid delivery issues

- Verify sender domain in SendGrid
- Check SendGrid API key permissions
- Review SendGrid activity feed for bounces/blocks

## Best Practices

1. **Always include userName** - Personalized emails have better engagement
2. **Test templates** before going live
3. **Monitor delivery rates** in the database
4. **Handle errors gracefully** - Log but don't block user flows
5. **Respect user preferences** - Check email notification settings
6. **Use system API key** for automated sends (cron jobs, webhooks)

## Security

- Service emails don't cost user points
- System API key required for automated sends
- RLS policies prevent unauthorized access to email logs
- Email content is never stored (only metadata)
