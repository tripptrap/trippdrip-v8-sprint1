// AI Response Generation for Receptionist Mode

import OpenAI from 'openai';
import {
  ReceptionistSettings,
  ReceptionistResponseParams,
  ReceptionistResponseResult,
  ResponseType,
  DEFAULT_SYSTEM_PROMPT
} from './types';
import { isWithinBusinessHours, getBusinessHoursDisplay } from './businessHours';

// Lazy-load OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate a receptionist AI response
 */
export async function generateReceptionistResponse(
  params: ReceptionistResponseParams,
  settings: ReceptionistSettings
): Promise<ReceptionistResponseResult> {
  try {
    // Check business hours first
    const businessHoursCheck = isWithinBusinessHours(settings);

    if (!businessHoursCheck.isOpen) {
      // Return after-hours message
      const afterHoursMessage = settings.after_hours_message ||
        `Thanks for reaching out! We're currently closed. ${businessHoursCheck.nextOpenTime || 'We\'ll get back to you during business hours.'}`;

      return {
        success: true,
        response: afterHoursMessage,
        responseType: 'after_hours',
        pointsUsed: 0, // No points for automated after-hours message
      };
    }

    // Check if this is a new contact and should get a greeting
    const isFirstMessage = !params.conversationHistory || params.conversationHistory.length <= 1;
    const isNewContact = params.contactType === 'new_contact';

    // Build the system prompt
    const systemPrompt = buildSystemPrompt(settings, params, isFirstMessage && isNewContact);

    // Build conversation messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history (last 10 messages for context)
    if (params.conversationHistory && params.conversationHistory.length > 0) {
      const recentHistory = params.conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        const role = msg.direction === 'inbound' ? 'user' : 'assistant';
        messages.push({ role, content: msg.body });
      }
    }

    // Add the current inbound message
    messages.push({ role: 'user', content: params.inboundMessage });

    // Call OpenAI
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 200,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content?.trim();

    if (!response) {
      return {
        success: false,
        error: 'AI generated empty response',
        responseType: 'error',
      };
    }

    // Determine response type based on content
    const responseType = detectResponseType(params.inboundMessage, response, isFirstMessage && isNewContact);

    return {
      success: true,
      response: ensureResponseLength(response),
      responseType,
      pointsUsed: 2,
    };

  } catch (error: any) {
    console.error('Receptionist AI error:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate response',
      responseType: 'error',
    };
  }
}

/**
 * Build the system prompt for the receptionist
 */
function buildSystemPrompt(
  settings: ReceptionistSettings,
  params: ReceptionistResponseParams,
  isNewContactGreeting: boolean
): string {
  const basePrompt = settings.system_prompt || DEFAULT_SYSTEM_PROMPT;
  const businessHours = getBusinessHoursDisplay(settings);

  let prompt = `${basePrompt}

CURRENT CONTACT:
- Name: ${params.leadName || 'Unknown'}
- Type: ${params.contactType === 'sold_client' ? 'Existing Client (Sold)' : params.contactType === 'new_contact' ? 'New Contact' : 'Lead'}
- Phone: ${params.phoneNumber}

BUSINESS HOURS: ${businessHours}`;

  // Add greeting instruction for new contacts
  if (isNewContactGreeting && settings.greeting_message) {
    prompt += `

IMPORTANT: This is a NEW CONTACT reaching out for the first time.
${settings.greeting_message ? `Use this greeting style: "${settings.greeting_message}"` : 'Give them a warm welcome and ask how you can help.'}`;
  }

  // Add calendar context if enabled
  if (settings.calendar_enabled) {
    prompt += `

SCHEDULING: You can help schedule appointments. When someone wants to book a meeting or call, ask for their preferred date/time and confirm you'll check availability.`;
  }

  prompt += `

SMS RULES:
- Keep responses under 160 characters when possible (max 320)
- Be conversational and friendly
- Use natural language, not formal business speak
- If you can't help, offer to have someone call them back
- Never make up information you don't have`;

  return prompt;
}

/**
 * Detect the type of response based on content
 */
function detectResponseType(
  inboundMessage: string,
  aiResponse: string,
  isGreeting: boolean
): ResponseType {
  const lowerInbound = inboundMessage.toLowerCase();
  const lowerResponse = aiResponse.toLowerCase();

  if (isGreeting) {
    return 'greeting';
  }

  // Check for scheduling-related keywords
  const schedulingKeywords = ['schedule', 'appointment', 'meeting', 'book', 'available', 'calendar', 'time', 'date', 'call back'];
  const hasSchedulingIntent = schedulingKeywords.some(kw =>
    lowerInbound.includes(kw) || lowerResponse.includes(kw)
  );

  if (hasSchedulingIntent) {
    return 'scheduling';
  }

  return 'support';
}

/**
 * Ensure response doesn't exceed SMS limits
 */
function ensureResponseLength(response: string, maxLength: number = 320): string {
  if (response.length <= maxLength) {
    return response;
  }

  // Try to break at sentence boundary
  const truncated = response.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');

  const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (breakPoint > maxLength * 0.6) {
    return truncated.substring(0, breakPoint + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}
