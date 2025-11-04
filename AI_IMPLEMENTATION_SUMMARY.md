# AI Implementation Summary - TrippDrip v8

## Overview
This application uses OpenAI's GPT-4o-mini model to power three main AI features. All AI features use a points-based system to manage costs.

---

## 1. AI-Powered Document Parsing for Lead Import

### What It Does
Automatically reads and extracts lead information from any uploaded document (CSV, TXT, JSON, PDF, DOCX, etc.)

### Location
- **API Endpoint**: `app/api/leads/upload-document/route.ts`
- **UI Integration**: `app/leads/page.tsx` (purple "AI Parse Document" button)

### How It Works
1. User uploads a document file
2. File content is sent to OpenAI with instructions to extract lead data
3. AI parses the document and returns structured JSON with:
   - first_name
   - last_name
   - phone
   - email
   - state
   - Any other relevant fields
4. Leads are automatically saved to leads.json with deduplication

### Cost
- **3 points per document**
- Uses GPT-4o-mini model
- Temperature: 0.3 (focused/deterministic)
- Max tokens: 4000

### Example Use Cases
- Upload a messy CSV with inconsistent columns
- Parse a PDF with contact information
- Extract leads from a text file with unstructured data
- Convert any document format to structured lead data

---

## 2. AI Text Message Replies

### What It Does
Generates contextual, personalized text message replies based on conversation history

### Location
- **API Endpoint**: `app/api/ai-response/route.ts`
- **UI Integration**: `app/texts/page.tsx` (toggle "Reply with AI")

### How It Works
1. User enables "Reply with AI" toggle on Texts page
2. When clicking "AI Reply" button (or send with empty input in AI mode)
3. Entire conversation history is sent to OpenAI
4. AI generates a natural, contextual response as a sales representative
5. Response is automatically added to the conversation

### AI Context Includes
- Full conversation history
- Lead's name
- Lead's phone, email, state
- Role: "helpful sales representative"

### Cost
- **2 points per AI reply**
- Uses GPT-4o-mini model
- Temperature: 0.7 (natural/conversational)
- Max tokens: 150 (keeps responses concise)

### Key Features
- Responses are 1-3 sentences (text message length)
- Maintains conversation context
- Professional but friendly tone
- Understands and responds to lead's questions naturally

---

## 3. AI Conversation Flow Generation

### What It Does
Creates complete multi-step conversation flows based on your business context

### Location
- **API Endpoint**: `app/api/generate-flow/route.ts`
- **UI Integration**: `app/templates/page.tsx` (flow creation form)

### How It Works
1. User fills out detailed questionnaire:
   - Flow name
   - Who you are (your business)
   - What you're offering
   - Who you're texting (target audience)
   - Information needed from clients
   - Key qualifying questions
   - Client goals (optional)
2. All context is sent to OpenAI
3. AI generates 2-3 step conversation flow with:
   - Initial message for each step
   - 4 response categories per step (e.g., "Interested", "Not interested", "Need info", "Price question")
   - Follow-up message for each response type
4. Flow is saved and can be:
   - Edited manually
   - Customized with tags (label + color) per step
   - Used in bulk SMS campaigns

### Cost
- **5 points per flow generation**
- Uses GPT-4o-mini model
- Temperature: 0.8 (creative but structured)
- Max tokens: 2000

### Key Features
- Natural, text-message style language
- Covers multiple response scenarios
- Includes objection handling
- Professional qualification questions
- Moves leads through sales funnel

### Flow Step Tags
Each generated flow step can have custom tags:
- **Label**: Custom text (e.g., "Qualification", "Follow-up", "Closing")
- **Color**: 6 preset colors (Red, Orange, Green, Blue, Purple, Pink)
- **Visible on Texts page**: Shows next to lead names to track conversation progress

---

## Points System

### Starting Balance
- New users: 1,000 points (included with $30/month base plan)

### Point Costs
| Feature | Cost | Model | Purpose |
|---------|------|-------|---------|
| Document Parsing | 3 points | GPT-4o-mini | Extract leads from any file |
| AI Text Reply | 2 points | GPT-4o-mini | Generate contextual responses |
| Flow Generation | 5 points | GPT-4o-mini | Create conversation flows |

### Point Packs Available
- **Starter**: 4,000 points for $40
- **Pro**: 10,000 points for $90 (10% off) - Popular
- **Business**: 25,000 points for $212.50 (15% off)
- **Enterprise**: 60,000 points for $480 (20% off)

### Notes
- Points never expire
- Points roll over month-to-month
- Low balance alerts at 200 points
- Real-time balance tracking

---

## API Configuration

### Required Environment Variable
```bash
OPENAI_API_KEY=your-openai-api-key-here
```

### Model Used
All features use **GPT-4o-mini** for cost-effectiveness while maintaining quality

### Error Handling
All AI endpoints include:
- Point balance checking before API calls
- Proper error messages
- Fallback behavior
- Response validation
- JSON parsing with markdown cleanup

---

## Integration with Other Features

### Conversation Flows → Bulk SMS
- Generated flows can be selected in Bulk SMS page
- First step's message pre-fills the SMS compose field
- Flow step tags help track campaign progress

### AI Replies → Conversation Flows
- AI can reference flow context when replying
- Maintains consistency with established flows
- Adapts responses based on current step

### Document Parsing → Campaigns
- Parsed leads can be tagged automatically
- Can be assigned to campaigns during upload
- Integrates seamlessly with existing lead management

---

## Best Practices

### For Document Parsing
- Works best with CSV, TXT, JSON formats
- Can handle unstructured data
- Extracts as much info as possible from any format
- Cleans phone numbers automatically

### For AI Text Replies
- Enable AI mode when you want automated responses
- Review AI suggestion before sending if needed
- AI learns from conversation context
- Works best with clear lead information

### For Flow Generation
- Fill out all questionnaire fields for best results
- More context = better flows
- Generated flows are fully editable
- Add custom tags to track progress
- Use flows in bulk campaigns for consistency

---

## Future Enhancements (Potential)

- **PDF Document Parsing**: Enhanced support for complex PDF layouts
- **Image-based Lead Extraction**: OCR from business cards/images
- **Multi-language Support**: AI responses in different languages
- **Sentiment Analysis**: Track lead engagement and interest level
- **A/B Testing**: AI-generated flow variations
- **Smart Scheduling**: AI-suggested best times to text
- **Intent Detection**: Automatically categorize lead responses

---

## Technical Implementation Notes

### All AI API Calls Use Direct Fetch
```typescript
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [...],
    temperature: 0.7,
    max_tokens: 150,
  }),
});
```

### Response Parsing
- Cleans markdown formatting (```json blocks)
- Validates JSON structure
- Returns meaningful error messages
- Includes points used in response

### Point Deduction
- Client-side deduction after successful API response
- Stored in localStorage (`pointsStore`)
- Transaction history maintained
- Usage statistics calculated

---

## Cost Estimation

### OpenAI API Costs (GPT-4o-mini)
Based on OpenAI's pricing:
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

### Approximate Real Costs
- **Document Parsing** (~3000 tokens): ~$0.001-0.002
- **Text Reply** (~500 tokens): ~$0.0003-0.0005
- **Flow Generation** (~2000 tokens): ~$0.001-0.002

### Points System Markup
The points system provides:
- Simplified billing for users
- Buffer for API cost variations
- Revenue for the platform
- Predictable usage tracking

---

**Last Updated**: 2025-11-03
**Version**: v8 Sprint 1
