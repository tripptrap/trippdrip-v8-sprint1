# HyveWyre Database Schema Reference

## Table of Contents
1. [Core Tables](#core-tables)
2. [Tags & Automation](#tags--automation)
3. [DNC Compliance](#dnc-compliance)
4. [RPC Functions](#rpc-functions)
5. [Data Flow Examples](#data-flow-examples)

---

## Core Tables

### `users` (extends auth.users)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (from Supabase Auth) |
| `email` | TEXT | User email |
| `plan_type` | TEXT | 'basic' or 'premium' |
| `auto_topup` | BOOLEAN | Auto-refill credits enabled |
| `auto_topup_threshold` | INTEGER | Credits level to trigger refill |
| `auto_topup_amount` | INTEGER | Credits to purchase |
| `last_renewal` | TIMESTAMPTZ | Last subscription renewal |

---

### `leads`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `first_name` | TEXT | First name |
| `last_name` | TEXT | Last name |
| `phone` | TEXT | Phone number (for SMS) |
| `email` | TEXT | Email address |
| `state` | TEXT | State/region |
| `tags` | TEXT[] | Array of tag names `['Hot Lead', 'Solar']` |
| `status` | TEXT | Lead status |
| `disposition` | TEXT | Disposition code |
| `custom_fields` | JSONB | Flexible custom data |
| `created_at` | TIMESTAMPTZ | Created timestamp |
| `updated_at` | TIMESTAMPTZ | Last updated |

**Indexes:** `user_id`, `phone`, `email`, `status`

---

### `threads`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `lead_id` | UUID | FK → leads |
| `lead_name` | TEXT | Cached lead name |
| `lead_phone` | TEXT | Cached phone |
| `channel` | TEXT | 'sms' or 'email' |
| `last_message_snippet` | TEXT | Preview of last message |
| `last_sender` | TEXT | 'lead' or 'agent' |
| `unread` | BOOLEAN | Has unread messages |
| `campaign_id` | UUID | FK → campaigns |
| `flow_step` | JSONB | Current AI flow position |
| `created_at` | TIMESTAMPTZ | Created |
| `updated_at` | TIMESTAMPTZ | Last activity |

---

### `messages`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `thread_id` | UUID | FK → threads |
| `direction` | TEXT | 'in' (inbound) or 'out' (outbound) |
| `sender` | TEXT | 'lead' or 'agent' |
| `body` | TEXT | Message content |
| `created_at` | TIMESTAMPTZ | Sent timestamp |

---

### `campaigns`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `name` | TEXT | Campaign name |
| `status` | TEXT | 'Draft', 'Running', 'Paused', 'Completed' |
| `filters` | JSONB | Lead filters `{"tags": ["Solar"], "state": "CA"}` |
| `from_numbers` | TEXT[] | Phone numbers to send from |
| `send_window` | JSONB | Time window `{"start": "09:00", "end": "17:00"}` |
| `steps` | JSONB | Campaign steps/messages |
| `stats` | JSONB | `{"sent": 0, "replied": 0, "failed": 0}` |

---

### `user_settings`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users (UNIQUE) |
| `sms_provider` | TEXT | 'none', 'telnyx' |
| `twilio_config` | JSONB | Legacy Twilio settings |
| `spam_protection` | JSONB | `{"enabled": true, "blockOnHighRisk": true, "maxHourlyMessages": 100}` |
| `auto_refill` | JSONB | `{"enabled": false, "threshold": 100, "amount": 500}` |

---

### `transactions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `action_type` | TEXT | 'earn', 'spend', 'purchase', 'subscription' |
| `points_amount` | INTEGER | Credits amount (+/-) |
| `description` | TEXT | Human-readable description |
| `stripe_session_id` | TEXT | Stripe payment reference |
| `lead_id` | UUID | FK → leads (optional) |
| `message_id` | UUID | FK → messages (optional) |
| `campaign_id` | UUID | FK → campaigns (optional) |

---

### `sending_history`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `recipient_phone` | TEXT | Phone number sent to |
| `message_count` | INTEGER | Messages sent |
| `sent_at` | TIMESTAMPTZ | When sent |

**Used for:** Rate limiting, spam protection

---

## Tags & Automation

### `tags`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `name` | TEXT | Tag name (unique per user) |
| `color` | TEXT | Hex color `#3b82f6` |
| `position` | INTEGER | Sort order (drag-drop) |
| `created_at` | TIMESTAMPTZ | Created |
| `updated_at` | TIMESTAMPTZ | Updated |

**Index:** `idx_tags_position ON tags(user_id, position)`

---

### `tag_groups`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `name` | TEXT | Group name (unique per user) |
| `color` | TEXT | Hex color |
| `tag_names` | TEXT[] | Array of tag names in group |
| `created_at` | TIMESTAMPTZ | Created |
| `updated_at` | TIMESTAMPTZ | Updated |

**Example:** `tag_names = ['New Lead', 'Contacted', 'Qualified', 'Closed']`

---

### `auto_tagging_rules`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `name` | TEXT | Rule name |
| `enabled` | BOOLEAN | Rule active |
| `trigger_type` | TEXT | See triggers below |
| `trigger_config` | JSONB | Trigger settings |
| `action_type` | TEXT | See actions below |
| `tag_name` | TEXT | Tag to add/remove |
| `condition_tags` | TEXT[] | Required existing tags |
| `condition_tags_mode` | TEXT | 'any', 'all', 'none' |
| `priority` | INTEGER | Execution order (lower = first) |

**Trigger Types:**
| Trigger | Description |
|---------|-------------|
| `lead_created` | When a new lead is added |
| `message_received` | When lead sends SMS |
| `message_sent` | When you send SMS |
| `appointment_booked` | When appointment created |
| `no_response` | Lead hasn't replied in X days |
| `keyword_match` | Message contains keywords |
| `lead_replied` | Lead's first reply |

**Action Types:**
| Action | Description |
|--------|-------------|
| `add_tag` | Add tag to lead |
| `remove_tag` | Remove tag from lead |
| `set_primary_tag` | Set as primary tag |
| `replace_tag` | Replace condition tags with new tag |

**trigger_config Examples:**
```json
// keyword_match
{"keywords": ["interested", "yes", "call me"], "match_type": "any"}

// no_response
{"days": 3}

// lead_created
{"source": "import"}
```

---

## DNC Compliance

### `dnc_list` (User's blocked numbers)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `phone_number` | VARCHAR(20) | Original phone input |
| `normalized_phone` | VARCHAR(20) | E.164 format `+15551234567` |
| `reason` | VARCHAR(50) | 'manual', 'opt_out', 'complaint', 'legal' |
| `source` | VARCHAR(100) | Where opt-out came from |
| `notes` | TEXT | Additional notes |
| `added_by` | VARCHAR(50) | 'user', 'system', 'admin' |
| `created_at` | TIMESTAMPTZ | Added date |

**Unique constraint:** `(user_id, normalized_phone)`

---

### `dnc_global` (System-wide blocked)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `phone_number` | VARCHAR(20) | Original phone |
| `normalized_phone` | VARCHAR(20) | E.164 format (UNIQUE) |
| `reason` | VARCHAR(50) | Reason for blocking |
| `complaint_count` | INTEGER | Number of complaints |
| `last_complaint_date` | TIMESTAMPTZ | Most recent complaint |

**RLS:** Read-only for users, system-only modifications

---

### `dnc_history` (Audit log)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → auth.users |
| `phone_number` | VARCHAR(20) | Phone checked/modified |
| `normalized_phone` | VARCHAR(20) | E.164 format |
| `action` | VARCHAR(20) | 'added', 'removed', 'checked', 'blocked', 'updated' |
| `list_type` | VARCHAR(20) | 'user', 'global', 'none' |
| `result` | BOOLEAN | For checks: was on list? |
| `metadata` | JSONB | `{"reason": "opt_out", "source": "webhook"}` |
| `created_at` | TIMESTAMPTZ | When action occurred |

---

## RPC Functions

### Phone Normalization
```sql
normalize_phone(phone_input VARCHAR) → VARCHAR
-- Converts any phone format to E.164
-- "555-123-4567" → "+15551234567"
-- "(555) 123-4567" → "+15551234567"
```

### DNC Functions
```sql
check_dnc(user_id, phone) → JSON
-- Returns: {on_dnc_list, on_user_list, on_global_list, reason, source}
-- Also logs check to dnc_history

add_to_dnc(user_id, phone, reason, source, notes) → JSON
-- Adds or updates DNC entry
-- Returns: {success, action: 'added'|'updated', id}

remove_from_dnc(user_id, phone) → JSON
-- Removes from user's DNC list
-- Returns: {success, removed}

get_dnc_stats(user_id) → JSON
-- Returns: {total_user_dnc, total_global_dnc, by_reason, checks_last_30_days, blocked_last_30_days}

bulk_add_to_dnc(user_id, phone_numbers[], reason, source) → JSON
-- Bulk import
-- Returns: {success, added, updated, failed, total_processed}
```

### Auto-Tagging
```sql
execute_auto_tagging_rule(user_id, lead_id, trigger_type, trigger_data)
  → TABLE(rule_id, rule_name, action_taken)
-- Called by API when triggers fire
-- Returns which rules executed and what actions taken
```

---

## Data Flow Examples

### SMS Sent → DNC Check → Message Stored
```
1. User sends SMS
2. API calls check_dnc(user_id, phone)
3. If on_dnc_list = true → Return 403, log to dnc_history
4. If clear → Send via Telnyx
5. Store in messages table
6. Update thread.last_message_snippet
7. execute_auto_tagging_rule(user_id, lead_id, 'message_sent')
```

### Lead Replies → Auto-Tag
```
1. Telnyx webhook receives inbound SMS
2. Match to thread by phone
3. Store in messages table
4. execute_auto_tagging_rule(user_id, lead_id, 'message_received', {body: "..."})
5. If keyword_match rule exists → Check keywords
6. If match → Add tag to lead.tags array
```

### Opt-Out Flow
```
1. Lead texts "STOP"
2. Telnyx webhook detects opt-out keyword
3. Call add_to_dnc(user_id, phone, 'opt_out', 'sms_keyword')
4. Update lead.sms_opt_in = false
5. Future sends to this number → Blocked with 403
```

---

## Row Level Security (RLS)

All tables follow this pattern:

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Standard policies
CREATE POLICY "Users can view their own data"
  ON table_name FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data"
  ON table_name FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own data"
  ON table_name FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own data"
  ON table_name FOR DELETE
  USING (auth.uid() = user_id);
```

**Exception:** `dnc_global` is read-only for users (system-managed)

---

## Updated At Trigger

All tables with `updated_at` use this trigger:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tablename_updated_at
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Common JSONB Patterns

### Lead Custom Fields
```json
{
  "company": "Acme Inc",
  "budget": 50000,
  "timeline": "Q2 2024",
  "notes": "Interested in solar panels"
}
```

### Campaign Filters
```json
{
  "tags": ["Solar", "California"],
  "state": "CA",
  "status": "new"
}
```

### Spam Protection Settings
```json
{
  "enabled": true,
  "blockOnHighRisk": true,
  "maxHourlyMessages": 100,
  "maxDailyMessages": 1000
}
```

### Auto-Refill Settings
```json
{
  "enabled": true,
  "threshold": 100,
  "amount": 500
}
```
