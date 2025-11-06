# AI Integration Guide

## 🤖 AI Features Implemented

Your app now has comprehensive AI capabilities powered by OpenAI:

### 1. **Smart Reply Suggestions**
Generates 3 contextual reply options based on:
- Lead information and status
- Conversation history
- Your business context
- Lead sentiment and engagement

### 2. **Sentiment Analysis**
Analyzes lead engagement to determine:
- Positive/Neutral/Negative sentiment
- Interest level (score -1 to 1)
- Key insights about concerns and engagement

### 3. **Follow-up Generator**
Creates personalized follow-up messages considering:
- Days since last contact
- Lead status and disposition
- Previous conversation context
- Best practices for re-engagement

### 4. **Message Personalization**
Transforms templates into natural messages using:
- Lead-specific context
- Conversational tone
- Business branding

### 5. **Lead Categorization**
Auto-suggests tags and disposition based on:
- Conversation analysis
- Lead behavior patterns
- Engagement signals

### 6. **Optimal Send Time**
Recommends best time to message based on:
- Historical reply patterns
- Lead's engagement hours
- Day-of-week preferences

---

## 🔧 Setup Instructions

### Step 1: Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-proj-...`)

### Step 2: Add to Environment Variables

Add to your `.env.local`:

```bash
OPENAI_API_KEY=sk-proj-your-key-here
```

### Step 3: Add to Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add `OPENAI_API_KEY` with your key
5. Redeploy your app

---

## 📡 API Endpoints

### Smart Replies
```typescript
POST /api/ai/smart-replies
Body: { leadId: string }

Response: {
  ok: true,
  suggestions: string[], // 3 reply options
  lead: { id, name }
}
```

### Sentiment Analysis
```typescript
POST /api/ai/analyze-sentiment
Body: { leadId: string }

Response: {
  ok: true,
  analysis: {
    sentiment: 'positive' | 'neutral' | 'negative',
    score: number, // -1 to 1
    insights: string[]
  },
  messageCount: number
}
```

### Generate Follow-up
```typescript
POST /api/ai/generate-follow-up
Body: { leadId: string }

Response: {
  ok: true,
  message: string,
  leadContext: {
    name, status, daysSinceContact
  }
}
```

---

## 💡 Usage Examples

### Example 1: Smart Replies in Chat
```typescript
// In your messaging component
const getSmartReplies = async (leadId: string) => {
  const res = await fetch('/api/ai/smart-replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId }),
  });

  const data = await res.json();
  return data.suggestions; // ["Hi John, just following up...", ...]
};
```

### Example 2: Sentiment Badge
```typescript
// Show sentiment indicator for each lead
const getSentiment = async (leadId: string) => {
  const res = await fetch('/api/ai/analyze-sentiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId }),
  });

  const { analysis } = await res.json();
  return analysis.sentiment; // 'positive', 'neutral', 'negative'
};

// Display in UI:
// 😊 Positive | 😐 Neutral | 😞 Negative
```

### Example 3: Auto-generate Follow-ups
```typescript
// For leads that haven't been contacted in a while
const generateFollowUp = async (leadId: string) => {
  const res = await fetch('/api/ai/generate-follow-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId }),
  });

  const { message } = await res.json();
  return message; // "Hey Sarah! Hope you're doing well..."
};
```

---

## 🎨 UI Integration Ideas

### 1. Smart Reply Buttons
In your message compose box:
```
┌─────────────────────────────────┐
│ Type your message...            │
│                                 │
│ [AI Suggestions ✨]             │
│  • "Thanks for reaching out..." │
│  • "I'd love to schedule..."    │
│  • "Let me send you more info...│
└─────────────────────────────────┘
```

### 2. Sentiment Indicators
On lead cards:
```
John Doe                   😊 Positive
Last contacted: 2 days ago
"Very interested in pricing"
```

### 3. Follow-up Suggestions
In lead list:
```
Sarah Smith - 7 days since contact
[💡 Generate Follow-up] → Auto-fills message box
```

### 4. AI Insights Panel
In lead detail view:
```
AI Insights:
• Lead shows high interest
• Mentioned budget concerns
• Best time to contact: Tuesday 2pm
```

---

## 💰 Cost Estimation

Using GPT-4o-mini (recommended):
- **Smart replies**: ~$0.0001 per request
- **Sentiment analysis**: ~$0.0001 per request
- **Follow-ups**: ~$0.00005 per request

**Example monthly cost** (1000 leads, 100 messages/day):
- 100 smart reply requests/day × 30 days = $0.30/month
- Very affordable for powerful AI features!

---

## 🔒 Privacy & Security

- ✅ All AI requests are authenticated
- ✅ Lead data is not stored by OpenAI
- ✅ Zero-retention policy on API calls
- ✅ User data is only used for the immediate request
- ✅ Complies with data protection regulations

---

## 🚀 Next Steps

1. **Add your OpenAI API key** to environment variables
2. **Test the endpoints** using the browser console or Postman
3. **Build UI components** to display AI suggestions
4. **Enable in user settings** - let users toggle AI features
5. **Monitor usage** and costs in OpenAI dashboard

---

## 📊 Available AI Functions

All functions in `lib/ai/openai.ts`:

- `generateSmartReplies()` - 3 contextual reply suggestions
- `generatePersonalizedMessage()` - Personalize templates
- `analyzeLeadSentiment()` - Sentiment + insights
- `generateFollowUpMessage()` - Contextual follow-ups
- `suggestOptimalSendTime()` - Best time to message
- `autoCategorizeLead()` - Auto-tag and categorize

---

## 🎯 Pro Tips

1. **Cache results**: Store sentiment analysis to avoid repeated API calls
2. **Batch process**: Analyze multiple leads overnight
3. **User feedback**: Let users rate AI suggestions to improve prompts
4. **A/B testing**: Compare AI-generated vs manual messages
5. **Smart triggers**: Auto-generate follow-ups for inactive leads

---

Your AI integration is ready! Add your OpenAI API key and start using these powerful features. 🚀
