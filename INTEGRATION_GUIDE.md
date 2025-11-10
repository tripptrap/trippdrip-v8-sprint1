# Integration Guide - Lead Management, Session Tracking & AI Templates

## What Was Added

### 1. AI Response Templates (`lib/ai/templates.ts`)
Pre-built response templates for consistent AI conversations:
- Greeting, question, confirmation, calendar, error, acknowledgment templates
- Template rendering with variable substitution
- Scenario detection based on conversation state
- Auto-generation of templated responses

### 2. Session Manager (`lib/conversations/sessionManager.ts`)
Helper functions for lead and session management:
- `upsertLeadFromConversation()` - Create/update leads from collected info
- `createSession()` - Create new conversation session
- `updateSession()` - Update session progress
- `completeSession()` - Mark session as completed
- `trackLeadActivity()` - Log lead interactions
- `getAbandonedSessions()` - Find sessions for recovery

### 3. API Endpoints

#### Conversation Sessions (`/api/conversations/sessions`)
- `GET` - List all sessions (with filters)
- `POST` - Create new session
- `PUT` - Update session

#### Conversation Recovery (`/api/conversations/recover`)
- `GET ?sessionId=xxx` - Recover abandoned session
- `POST /link` - Generate recovery link for session

### 4. Database Schema
New tables created via migration:
- **conversation_sessions** - Track conversation state
- **lead_activities** - Log all lead interactions
- **Enhanced leads table** - Added conversation tracking fields

## How to Integrate Into Conversation Flow

### Step 1: Import Required Modules

Add to `app/api/test-flow-response/route.ts`:

```typescript
import {
  upsertLeadFromConversation,
  createSession,
  updateSession,
  completeSession,
  trackLeadActivity
} from "@/lib/conversations/sessionManager";

import {
  generateTemplatedResponse,
  renderTemplate
} from "@/lib/ai/templates";
```

### Step 2: Track Session on First Message

When conversation starts (first message):

```typescript
// Create or update lead
const { leadId } = await upsertLeadFromConversation(
  user.id,
  collectedInfo,
  flow.id
);

// Create session
const { sessionId } = await createSession(user.id, {
  flowId: flow.id,
  leadId: leadId || undefined,
  collectedInfo,
  conversationHistory,
  currentStep: step
});

// Store sessionId in conversation state for subsequent updates
```

### Step 3: Update Session on Each Message

```typescript
// Update session with latest state
if (sessionId) {
  await updateSession(user.id, sessionId, {
    collectedInfo,
    conversationHistory,
    currentStep: step
  });

  // Update lead if we have new info
  if (leadId) {
    await upsertLeadFromConversation(user.id, collectedInfo, flow.id);
  }
}
```

### Step 4: Use AI Templates (Optional)

Instead of relying only on OpenAI, you can use templates for common scenarios:

```typescript
// Detect scenario and generate templated response
const templatedResponse = generateTemplatedResponse({
  allQuestionsAnswered,
  requiredQuestions,
  collectedFieldsCount,
  currentField: step?.field,
  userName: collectedInfo.name
});

// Use templated response as fallback if AI fails
if (!aiResponse && templatedResponse) {
  agentResponse = templatedResponse;
}

// Or use specific templates
const greetingResponse = renderTemplate('greeting_initial', {
  userName: collectedInfo.name || 'there'
});
```

### Step 5: Complete Session When Done

When conversation completes (appointment booked):

```typescript
if (sessionId && appointmentBooked) {
  await completeSession(
    user.id,
    sessionId,
    true, // appointment booked
    selectedSlot.start, // appointment time
    googleEventId // Google Calendar event ID
  );

  // Track activity
  if (leadId) {
    await trackLeadActivity(
      user.id,
      leadId,
      'appointment_scheduled',
      `Appointment scheduled for ${selectedSlot.start}`,
      {
        slot: selectedSlot,
        eventId: googleEventId
      }
    );
  }
}
```

## Example: Full Integration

```typescript
export async function POST(req: NextRequest) {
  // ... existing setup ...

  let sessionId = req.headers.get('x-session-id'); // Or from body/cookie
  let leadId: string | null = null;

  // STEP 1: On first message, create lead and session
  if (!sessionId && collectedFieldsCount === 0) {
    const { leadId: newLeadId } = await upsertLeadFromConversation(
      user.id,
      collectedInfo,
      flow.id
    );
    leadId = newLeadId;

    const { sessionId: newSessionId } = await createSession(user.id, {
      flowId: flow.id,
      leadId: leadId || undefined,
      collectedInfo,
      conversationHistory
    });
    sessionId = newSessionId;
  }

  // STEP 2: Update session and lead on each message
  if (sessionId) {
    await updateSession(user.id, sessionId, {
      collectedInfo,
      conversationHistory
    });

    // Update lead with latest info
    const { leadId: updatedLeadId } = await upsertLeadFromConversation(
      user.id,
      collectedInfo,
      flow.id
    );
    if (!leadId) leadId = updatedLeadId;
  }

  // ... generate AI response ...

  // STEP 3: Use templates as fallback
  if (!agentResponse) {
    agentResponse = generateTemplatedResponse({
      allQuestionsAnswered,
      requiredQuestions,
      collectedFieldsCount,
      userName: collectedInfo.name
    });
  }

  // STEP 4: Complete session when done
  if (allQuestionsAnswered && appointmentBooked) {
    if (sessionId) {
      await completeSession(
        user.id,
        sessionId,
        true,
        appointmentTime,
        googleEventId
      );
    }

    if (leadId) {
      await trackLeadActivity(
        user.id,
        leadId,
        'appointment_scheduled',
        'Appointment booked successfully'
      );
    }
  }

  // Return sessionId in response headers
  return NextResponse.json(
    { message: agentResponse, ...otherData },
    { headers: { 'x-session-id': sessionId || '' } }
  );
}
```

## Recovery Flow

### Detecting Abandoned Sessions

Run a periodic job (cron/scheduled function) to find abandoned sessions:

```typescript
const abandoned = await getAbandonedSessions(userId, 1); // 1 hour inactive

for (const session of abandoned) {
  // Generate recovery link
  const response = await fetch('/api/conversations/recover/link', {
    method: 'POST',
    body: JSON.stringify({ sessionId: session.id })
  });

  const { recoveryLink } = await response.json();

  // Send recovery link via SMS/email to lead
  if (session.lead?.phone) {
    // Send SMS with recovery link
  }
}
```

### Recovering a Session

When user clicks recovery link (`/recover?sessionId=xxx`):

```typescript
const response = await fetch(`/api/conversations/recover?sessionId=${sessionId}`);
const { session } = await response.json();

// Restore conversation state
collectedInfo = session.collected_info;
conversationHistory = session.conversation_history;

// Continue conversation from where they left off
```

## Benefits

1. **Lead Tracking** - Every conversation creates/updates a lead
2. **Session Persistence** - Conversations can be recovered if abandoned
3. **Activity History** - Complete audit trail of all interactions
4. **Consistent Responses** - AI templates ensure quality
5. **Recovery Links** - Re-engage abandoned conversations
6. **Analytics Ready** - All data structured for reporting

## Next Steps

- Integrate session management into `/api/test-flow-response/route.ts`
- Add recovery UI page at `/recover`
- Set up abandoned session detection job
- Build lead dashboard to view all tracked leads
- Add SMS notifications for recovery links (Phase 3)
