/**
 * OpenAI Integration
 * Provides AI-powered features for message suggestions, smart replies, and more
 */

import OpenAI from 'openai';

// Lazy-load OpenAI client to avoid build-time errors
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }
  return openaiClient;
}

/**
 * Generate smart reply suggestions based on conversation context
 */
export async function generateSmartReplies(
  leadContext: {
    firstName?: string;
    lastName?: string;
    company?: string;
    status?: string;
    disposition?: string;
  },
  conversationHistory: Array<{
    direction: 'inbound' | 'outbound';
    content: string;
    timestamp: string;
  }>,
  userContext?: {
    businessName?: string;
    agentName?: string;
  }
): Promise<string[]> {
  const historyText = conversationHistory
    .slice(-5) // Last 5 messages
    .map(msg => `${msg.direction === 'inbound' ? 'Lead' : 'You'}: ${msg.content}`)
    .join('\n');

  const prompt = `You are a helpful sales assistant. Generate 3 short, professional SMS reply suggestions for this conversation.

Lead Info:
- Name: ${leadContext.firstName} ${leadContext.lastName}
- Company: ${leadContext.company || 'N/A'}
- Status: ${leadContext.status || 'new'}
- Disposition: ${leadContext.disposition || 'neutral'}

${userContext ? `Your Info:
- Business: ${userContext.businessName || 'N/A'}
- Agent: ${userContext.agentName || 'Agent'}
` : ''}

Recent Conversation:
${historyText}

Generate 3 varied reply options (short, under 160 characters each). Return ONLY the replies, one per line, no numbering or labels.`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional sales communication assistant. Generate concise, friendly SMS replies.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const suggestions = response.choices[0]?.message?.content
      ?.split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 3) || [];

    return suggestions;
  } catch (error) {
    console.error('Error generating smart replies:', error);
    return [];
  }
}

/**
 * Generate personalized message from template
 */
export async function generatePersonalizedMessage(
  template: string,
  leadContext: {
    firstName?: string;
    lastName?: string;
    company?: string;
    email?: string;
    phone?: string;
  },
  userContext?: {
    businessName?: string;
    agentName?: string;
  }
): Promise<string> {
  const prompt = `Personalize this message template for the lead. Keep it natural and conversational.

Template: ${template}

Lead Info:
- Name: ${leadContext.firstName} ${leadContext.lastName}
- Company: ${leadContext.company || 'N/A'}

${userContext ? `Sender Info:
- Business: ${userContext.businessName || 'Your Business'}
- Agent: ${userContext.agentName || 'Agent'}
` : ''}

Return ONLY the personalized message, no explanations.`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You personalize message templates naturally and professionally.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.6,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content?.trim() || template;
  } catch (error) {
    console.error('Error personalizing message:', error);
    return template;
  }
}

/**
 * Analyze lead sentiment from conversation
 */
export async function analyzeLeadSentiment(
  conversationHistory: Array<{
    direction: 'inbound' | 'outbound';
    content: string;
  }>
): Promise<{
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number; // -1 to 1
  insights: string[];
}> {
  const leadMessages = conversationHistory
    .filter(msg => msg.direction === 'inbound')
    .map(msg => msg.content)
    .join('\n');

  if (!leadMessages.trim()) {
    return {
      sentiment: 'neutral',
      score: 0,
      insights: ['No messages from lead yet'],
    };
  }

  const prompt = `Analyze the sentiment of these messages from a sales lead and provide insights:

${leadMessages}

Return a JSON object with:
{
  "sentiment": "positive" | "neutral" | "negative",
  "score": number between -1 and 1,
  "insights": [array of 2-3 brief insights about their interest level, concerns, or engagement]
}`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a sales psychology expert analyzing lead sentiment.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 200,
    });

    const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');
    return {
      sentiment: analysis.sentiment || 'neutral',
      score: analysis.score || 0,
      insights: analysis.insights || [],
    };
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    return {
      sentiment: 'neutral',
      score: 0,
      insights: ['Unable to analyze sentiment'],
    };
  }
}

/**
 * Generate follow-up message based on lead status
 */
export async function generateFollowUpMessage(
  leadContext: {
    firstName?: string;
    status?: string;
    disposition?: string;
    daysSinceContact?: number;
  },
  conversationSummary?: string
): Promise<string> {
  const prompt = `Generate a follow-up SMS for this lead:

Lead: ${leadContext.firstName}
Status: ${leadContext.status}
Disposition: ${leadContext.disposition}
Days since last contact: ${leadContext.daysSinceContact || 0}

${conversationSummary ? `Previous conversation summary: ${conversationSummary}` : ''}

Generate a short, professional follow-up message (under 160 characters). Be friendly and provide value.`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a sales follow-up expert. Create engaging, value-driven messages.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('Error generating follow-up:', error);
    return '';
  }
}

/**
 * Suggest optimal send time based on lead behavior
 */
export async function suggestOptimalSendTime(
  leadEngagementPattern: {
    messagesSent: Array<{ timestamp: string; replied: boolean }>;
    timezone?: string;
  }
): Promise<{
  suggestedHour: number;
  suggestedDay: string;
  confidence: number;
  reasoning: string;
}> {
  // Analyze reply patterns
  const repliedMessages = leadEngagementPattern.messagesSent.filter(m => m.replied);

  if (repliedMessages.length === 0) {
    return {
      suggestedHour: 10, // 10 AM default
      suggestedDay: 'Tuesday',
      confidence: 0.3,
      reasoning: 'No reply history - using general best practices',
    };
  }

  // Calculate hour distribution
  const hourCounts: Record<number, number> = {};
  repliedMessages.forEach(msg => {
    const hour = new Date(msg.timestamp).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  const bestHour = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)[0];

  // Calculate day distribution
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCounts: Record<string, number> = {};
  repliedMessages.forEach(msg => {
    const day = dayNames[new Date(msg.timestamp).getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });

  const bestDay = Object.entries(dayCounts)
    .sort(([, a], [, b]) => b - a)[0];

  const confidence = Math.min(repliedMessages.length / 10, 1); // Max confidence at 10 replies

  return {
    suggestedHour: parseInt(bestHour[0]),
    suggestedDay: bestDay[0],
    confidence,
    reasoning: `Based on ${repliedMessages.length} previous replies. Lead tends to engage at ${bestHour[0]}:00 on ${bestDay[0]}s.`,
  };
}

/**
 * Auto-categorize lead based on conversation
 */
export async function autoCategorizeLead(
  conversationHistory: Array<{
    direction: 'inbound' | 'outbound';
    content: string;
  }>,
  leadInfo: {
    company?: string;
    source?: string;
  }
): Promise<{
  suggestedTags: string[];
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
}> {
  const allMessages = conversationHistory
    .map(msg => `${msg.direction === 'inbound' ? 'Lead' : 'Agent'}: ${msg.content}`)
    .join('\n');

  const prompt = `Analyze this sales conversation and suggest categorization:

${allMessages}

Lead Info:
- Company: ${leadInfo.company || 'Unknown'}
- Source: ${leadInfo.source || 'Unknown'}

Return JSON:
{
  "suggestedTags": [array of 2-4 relevant tags like "enterprise", "price-sensitive", "technical", etc],
  "suggestedDisposition": "qualified" | "callback" | "nurture" | "not_interested" | "neutral",
  "confidence": number 0-1,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a sales intelligence system that categorizes leads.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 200,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return {
      suggestedTags: result.suggestedTags || [],
      suggestedDisposition: result.suggestedDisposition || 'neutral',
      confidence: result.confidence || 0,
      reasoning: result.reasoning || '',
    };
  } catch (error) {
    console.error('Error categorizing lead:', error);
    return {
      suggestedTags: [],
      suggestedDisposition: 'neutral',
      confidence: 0,
      reasoning: 'Unable to categorize',
    };
  }
}
