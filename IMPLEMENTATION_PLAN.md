# TrippDrip v8 - Database Migration & Feature Implementation Plan

## Overview
This document outlines the complete migration from file-based storage to a PostgreSQL database with authentication, real-time features, and production deployment.

## Phase 1: Database Foundation ✅ IN PROGRESS

### 1.1 Database Setup
- [x] Install Prisma and dependencies
- [x] Create Prisma schema with all models (User, Lead, Campaign, Message, Transaction, ImportHistory)
- [x] Configure DATABASE_URL in .env.local
- [ ] Set up local PostgreSQL database OR use cloud provider (Supabase/Neon recommended)
- [ ] Run `npx prisma migrate dev --name init` to create tables
- [ ] Run `npx prisma generate` to generate Prisma Client

### 1.2 Database Connection
- [x] Create lib/prisma.ts singleton client
- [ ] Test database connection
- [ ] Create seed data script (optional)

## Phase 2: Authentication System

### 2.1 NextAuth Setup
- [ ] Install NextAuth.js with Prisma adapter
- [ ] Create auth configuration at `app/api/auth/[...nextauth]/route.ts`
- [ ] Set up credentials provider with bcrypt password hashing
- [ ] Add session management

### 2.2 Auth UI
- [ ] Create `/app/auth/signin/page.tsx` - Login page
- [ ] Create `/app/auth/signup/page.tsx` - Registration page
- [ ] Create `/app/auth/signout/page.tsx` - Logout confirmation
- [ ] Add protected route middleware
- [ ] Update layout with user session display

### 2.3 Session Protection
- [ ] Create middleware.ts to protect routes
- [ ] Add `getServerSession()` to all API routes
- [ ] Scope all database queries by userId

## Phase 3: CRUD API Routes (User-Scoped)

### 3.1 Leads API
- [ ] `GET /api/leads` - List leads with pagination, search, filters
- [ ] `POST /api/leads` - Create new lead
- [ ] `PUT /api/leads/[id]` - Update lead
- [ ] `DELETE /api/leads/[id]` - Delete lead
- [ ] `POST /api/leads/import` - Bulk import with undo tracking
- [ ] `POST /api/leads/undo-import/[id]` - Undo import

### 3.2 Messages API
- [ ] `GET /api/messages` - List messages (filtered by lead)
- [ ] `POST /api/messages` - Create message (manual send)
- [ ] `GET /api/messages/thread/[leadId]` - Get conversation thread

### 3.3 Campaigns API
- [ ] `GET /api/campaigns` - List campaigns
- [ ] `POST /api/campaigns` - Create campaign
- [ ] `PUT /api/campaigns/[id]` - Update campaign
- [ ] `DELETE /api/campaigns/[id]` - Delete campaign
- [ ] `POST /api/campaigns/[id]/run` - Execute campaign

### 3.4 Users API
- [ ] `GET /api/user/profile` - Get current user
- [ ] `PUT /api/user/profile` - Update profile
- [ ] `GET /api/user/balance` - Get all balances

## Phase 4: Frontend Migration

### 4.1 Leads Page
- [ ] Replace local JSON with database queries
- [ ] Add search bar with debounce
- [ ] Add tag filter dropdown (multi-select)
- [ ] Add campaign filter dropdown
- [ ] Add pagination controls (20/50/100 per page)
- [ ] Add "Run Campaign" button for selected leads
- [ ] Add "Undo Import" button in import history

### 4.2 Campaigns Page
- [ ] Fetch from database instead of localStorage
- [ ] Add campaign creation wizard
- [ ] Add campaign execution UI with progress bar
- [ ] Show campaign stats (sent/delivered/failed)

### 4.3 Messages/Texts Page
- [ ] Fetch messages from database
- [ ] Auto-refresh when new messages arrive
- [ ] Group by conversation thread

## Phase 5: Communication Features

### 5.1 SMS Integration
- [ ] Finalize `/api/sms/send` with Twilio
- [ ] Create `/api/sms/receive` webhook for incoming messages
- [ ] Log all SMS in messages table
- [ ] Deduct points on send
- [ ] Update lead's last contact timestamp

### 5.2 Email Integration
- [ ] Create `/api/email/send` with Nodemailer/SendGrid
- [ ] Combined send logic (SMS + Email for leads with both)
- [ ] Log all emails in messages table
- [ ] Track email open rates (optional)

### 5.3 Webhooks
- [ ] Twilio status callback handler (`/api/sms/status`)
- [ ] Twilio incoming message handler (`/api/sms/receive`)
- [ ] Email delivery tracking (if using SendGrid)

## Phase 6: Payment & Balance System

### 6.1 Stripe Integration
- [ ] Create `/api/stripe/webhook` for payment processing
- [ ] Handle `checkout.session.completed` event
- [ ] Split payments: 70% app_balance, 30% twilio_balance (configurable)
- [ ] Create Transaction records for all balance changes

### 6.2 Balance Management
- [ ] Display balances in header/nav
- [ ] Check balances before sending (SMS/Email/AI)
- [ ] Prevent actions when balance too low
- [ ] Add low-balance warning toast

### 6.3 Points System
- [ ] Deduct points for:
  - SMS: 1 point
  - Email: 0.5 points
  - AI response: 2 points
  - AI chat: 1 point
  - Flow generation: 5 points
- [ ] Create transaction records for all deductions

## Phase 7: AI Features

### 7.1 AI Auto-Reply
- [ ] Detect incoming messages that need replies
- [ ] Generate contextual responses with GPT-4
- [ ] Mark as ai_generated
- [ ] Deduct 2 points per AI response

### 7.2 AI Lead Tagging
- [ ] Analyze lead data on import
- [ ] Generate AI tags: "interested", "follow-up", "not-interested"
- [ ] Store in aiTags field
- [ ] Display in leads table

### 7.3 AI Column Mapping
- [ ] Analyze uploaded CSV headers
- [ ] Suggest field mappings with AI
- [ ] Allow user to confirm/override
- [ ] Save mapping for future imports

## Phase 8: UX Improvements

### 8.1 Toast Notifications
- [ ] Install react-hot-toast
- [ ] Add toast for:
  - Message sent ✓
  - Low balance warning ⚠️
  - Import success ✓
  - Campaign started 🚀
  - Error messages ❌

### 8.2 Keyboard Shortcuts
- [ ] `⌘S` / `Ctrl+S` - Save current form
- [ ] `ESC` - Close modals/drawers
- [ ] `⌘K` / `Ctrl+K` - Quick search (optional)

### 8.3 Pagination
- [ ] Add to leads table
- [ ] Add to messages list
- [ ] Add to campaigns list
- [ ] Configurable page size (20/50/100)

## Phase 9: Code Cleanup

### 9.1 Environment Variables
- [ ] Move all API keys to .env.local
- [ ] Remove hardcoded credentials
- [ ] Add .env.example template

### 9.2 Remove Dead Code
- [ ] Remove localStorage imports
- [ ] Remove file-based JSON operations
- [ ] Remove unused imports
- [ ] Remove console.logs

### 9.3 TypeScript Cleanup
- [ ] Fix any type errors
- [ ] Add proper types for all API responses
- [ ] Update interfaces for database models

## Phase 10: Testing

### 10.1 Local Testing
- [ ] Test user registration
- [ ] Test login/logout
- [ ] Test lead CRUD operations
- [ ] Test campaign execution
- [ ] Test SMS send/receive
- [ ] Test email sending
- [ ] Test payment processing
- [ ] Test AI features

### 10.2 Integration Testing
- [ ] Test Twilio webhooks locally (ngrok)
- [ ] Test Stripe webhooks locally (Stripe CLI)

## Phase 11: Deployment

### 11.1 Database Setup
- [ ] Create production PostgreSQL database (Supabase/Neon/Railway recommended)
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Set DATABASE_URL in production

### 11.2 Vercel Deployment
- [ ] Connect GitHub repo to Vercel
- [ ] Add all environment variables
- [ ] Deploy to production
- [ ] Test production build

### 11.3 Webhook Configuration
- [ ] Add Twilio webhook URL: `https://your-domain.com/api/sms/receive`
- [ ] Add Twilio status callback: `https://your-domain.com/api/sms/status`
- [ ] Add Stripe webhook: `https://your-domain.com/api/stripe/webhook`
- [ ] Verify webhook signatures in production

### 11.4 DNS & Email
- [ ] Configure SPF/DKIM records for email sending
- [ ] Verify domain in SendGrid (if using)
- [ ] Test email delivery

## Priority Order

### High Priority (MVP)
1. Database setup and migration
2. Authentication (signup/login)
3. Leads CRUD with user scoping
4. SMS send/receive
5. Basic campaign execution
6. Payment processing

### Medium Priority
7. Email integration
8. AI auto-reply
9. AI lead tagging
10. Advanced filtering
11. Toast notifications
12. Undo import

### Low Priority (Polish)
13. AI column mapping
14. Keyboard shortcuts
15. Advanced analytics
16. Email open tracking

## Estimated Timeline
- **Phase 1-3**: 2-3 days (Foundation)
- **Phase 4-6**: 2-3 days (Core Features)
- **Phase 7-8**: 1-2 days (AI & UX)
- **Phase 9-11**: 1-2 days (Polish & Deploy)

**Total**: 6-10 days for full implementation

## Next Steps

1. **Set up local PostgreSQL**:
   ```bash
   # Option A: Local PostgreSQL
   brew install postgresql  # macOS
   brew services start postgresql
   createdb trippdrip

   # Option B: Use Supabase (recommended)
   # Visit https://supabase.com
   # Create project, get DATABASE_URL
   ```

2. **Run migrations**:
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

3. **Test connection**:
   ```bash
   npx prisma studio  # Opens visual database editor
   ```

4. **Start implementing** authentication and API routes

## Notes
- This is a massive migration touching 50+ files
- Consider feature flags to enable gradual rollout
- Keep file-based system as backup during transition
- Test extensively before removing old code
