// AI Response Generation for Receptionist Mode

import OpenAI from 'openai';
import {
  ReceptionistSettings,
  ReceptionistResponseParams,
  ReceptionistResponseResult,
  ResponseType,
  FlowContext,
  DEFAULT_SYSTEM_PROMPT
} from './types';
import { isWithinBusinessHours, getBusinessHoursDisplay } from './businessHours';
import { getReceptionistPreset } from '@/lib/receptionistPresets';

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

    // A configured greeting is sent verbatim, free.
    //
    // It used to be handed to the model as a style hint ("Use this greeting
    // style: ...") and OpenAI rewrote it, which cost 2 points and meant the
    // greeting you configured was not the greeting anyone received.
    //
    // Sending it as written is both free and more predictable: a first
    // impression is the one message a business most wants to control. The AI
    // still handles everything the contact says after this.
    //
    // Only when a greeting is actually configured — otherwise fall through and
    // let the model write a welcome, which is better than sending nothing.
    if (isFirstMessage && isNewContact && settings.greeting_message?.trim()) {
      return {
        success: true,
        response: settings.greeting_message.trim(),
        responseType: 'greeting',
        pointsUsed: 0, // canned, no model call
      };
    }

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
  const id = settings.identity || {};
  const businessName = id.businessName || 'this business';

  // ── Identity block — always first so AI never forgets who it is ──────────────
  const identityLines: string[] = [];
  if (id.agentName)       identityLines.push(`- Your name: ${id.agentName}`);
  if (id.businessName)    identityLines.push(`- Business: ${id.businessName}`);
  if (id.whatYouOffer)    identityLines.push(`- What you offer: ${id.whatYouOffer}`);
  if (id.targetAudience)  identityLines.push(`- Who you help: ${id.targetAudience}`);
  if (id.serviceArea)     identityLines.push(`- Service area: ${id.serviceArea}`);
  if (id.callbackPhone)   identityLines.push(`- Phone to give out: ${id.callbackPhone}`);
  if (id.website)         identityLines.push(`- Website: ${id.website}`);
  if (id.tagline)         identityLines.push(`- Value prop: ${id.tagline}`);

  const identityBlock = identityLines.length > 0
    ? `WHO YOU ARE — answer ANY identity question from this section IMMEDIATELY and confidently:\n${identityLines.join('\n')}\n\nWhen someone asks "who are you?", "who do you work for?", "what do you want?", "what is this about?" — answer naturally using the above. NEVER say you don't know who you work for or what you're selling.\n\n`
    : '';

  // ── Base persona prompt (industry preset or custom) ──────────────────────────
  let basePrompt: string;
  if (settings.use_industry_preset && settings.industry) {
    const preset = getReceptionistPreset(settings.industry);
    // Replace {businessName} placeholder with the real name
    basePrompt = preset.systemPrompt.replace(/\{businessName\}/g, businessName);
    if (settings.system_prompt) {
      basePrompt += `\n\nADDITIONAL INSTRUCTIONS FROM BUSINESS OWNER:\n${settings.system_prompt}`;
    }
  } else {
    basePrompt = (settings.system_prompt || DEFAULT_SYSTEM_PROMPT)
      .replace(/\{businessName\}/g, businessName);
  }

  const businessHours = getBusinessHoursDisplay(settings);

  let prompt = `${identityBlock}${basePrompt}

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

  // Add flow qualification guidance when an active flow is present
  if (params.flowContext) {
    const fc = params.flowContext;

    // Full step list, in order, so the AI keeps the whole conversation's shape in
    // mind even though it only acts on the current step right now
    const stepList = fc.steps
      .map((s, i) => `  ${i + 1}. [${s.completed ? 'done' : 'pending'}] ${s.tagName}`)
      .join('\n');

    if (fc.allAnswered || !fc.currentStep) {
      // All steps collected — wrap up and offer next step
      const collected = Object.entries(fc.collectedInfo)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join('\n');
      prompt += `

QUALIFICATION FLOW — "${fc.flowName}" — ALL STEPS COMPLETE:
${stepList}

Collected info:
${collected}

INSTRUCTIONS: Every step in this flow has been completed. Confirm the details with the lead, thank them, and move toward booking an appointment or next step. Do NOT ask any more qualifying questions.`;
    } else {
      // Still on one specific step
      const collected = Object.keys(fc.collectedInfo).length > 0
        ? Object.entries(fc.collectedInfo)
            .map(([k, v]) => `  ✓ ${k}: ${v}`)
            .join('\n')
        : '  (none yet)';

      prompt += `

QUALIFICATION FLOW — "${fc.flowName}":
Full flow (for context/tone only — do not jump ahead):
${stepList}

Already collected:
${collected}

YOUR CURRENT STEP: "${fc.currentStep.tagName}"
INSTRUCTION FOR THIS STEP: ${fc.currentStep.aiInstruction}

INSTRUCTIONS:
- Acknowledge their last message naturally, then work only the CURRENT STEP's instruction above
- If the lead asks something unrelated or goes off-topic, answer it naturally using everything you know from the conversation so far, THEN steer back to the current step
- Do NOT skip ahead to a future step or ask multiple steps' worth of questions at once
- Keep it conversational — do not sound like a form
- Maintain a consistent tone across the whole conversation, even though this instruction only covers one step

- SERVE FIRST. If they have asked for something concrete that a person at this
  business could act on — a document, a card, a copy of something, a correction,
  a callback — say it is being handled and that someone will follow up. Do that
  BEFORE anything else. Never keep asking qualifying questions at someone who has
  made a clear request; that reads as being stonewalled by a form.
- The step instruction is a GOAL, not a script. If the current step's question
  makes no sense for this particular person — asking someone about their company
  when they are asking about their own policy — do not ask it. Say something
  useful instead and let the next message pick the thread up.
- Do NOT open two messages in a row the same way. If your last reply began "I can
  help with that", start differently. Repeated openers are the clearest sign to a
  human that they are talking to a machine.
- If two of your messages in a row have asked a question without moving anything
  forward, stop asking. Either state what you will do, or offer to have someone
  call.`;
    }
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
