import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { userMessage, currentStep, allSteps, conversationHistory, collectedInfo = {}, requiredQuestions = [], requiresCall = false } = await req.json();

    if (!userMessage || !currentStep || !allSteps) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check which required questions are still missing
    const missingQuestions = requiredQuestions.filter((q: any) => !collectedInfo[q.fieldName]);
    const allQuestionsAnswered = requiredQuestions.length > 0 && missingQuestions.length === 0;

    console.log('🔍 DEBUG - Required questions:', requiredQuestions.length);
    console.log('🔍 DEBUG - Missing questions:', missingQuestions.map((q: any) => q.fieldName));
    console.log('🔍 DEBUG - All questions answered?', allQuestionsAnswered);
    console.log('🔍 DEBUG - Collected info:', JSON.stringify(collectedInfo));

    // If flow requires call, check calendar availability
    let calendarSlots: any[] = [];
    if (requiresCall) {
      try {
        const calendarResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/test-flow-calendar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
          body: JSON.stringify({
            action: 'check-availability',
            dateRequested: 'today'
          })
        });

        const calendarData = await calendarResponse.json();

        if (calendarData.hasCalendar && calendarData.availableSlots) {
          calendarSlots = calendarData.availableSlots;
          console.log('📅 Calendar slots fetched:', calendarSlots.length);
        }
      } catch (error) {
        console.error('Calendar check error:', error);
      }
    }

    // Check if user is selecting a time slot
    let appointmentBooked = false;
    let bookedAppointmentInfo: any = null;
    if (requiresCall && calendarSlots.length > 0 && userMessage) {
      let selectedSlot = null;

      console.log(`🔍 Checking if "${userMessage}" is selecting a time from ${calendarSlots.length} available slots`);

      // Try to detect if user is selecting a time by:
      // 1. Time format (e.g., "1pm", "2:00", "3 PM", "10:00 AM")
      // 2. Index/number (e.g., "1", "option 2", "the first one")

      // First, try to match specific time mentions like "1pm", "2pm", "3:00 PM", etc.
      const timeMatch = userMessage.match(/(\d{1,2})(?::00)?\s*(am|pm|AM|PM)/i);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const period = timeMatch[2].toLowerCase();

        // Convert to 24-hour format
        let hour24 = hour;
        if (period === 'pm' && hour !== 12) {
          hour24 = hour + 12;
        } else if (period === 'am' && hour === 12) {
          hour24 = 0;
        }

        console.log(`🕐 Looking for ${hour24}:00 (from "${userMessage}")`);

        // Find the slot that matches this time from the CURRENT calendar slots
        selectedSlot = calendarSlots.find((slot: any) => {
          const slotDate = new Date(slot.start);
          const slotHour = slotDate.getHours();
          console.log(`  - Checking slot at ${slotHour}:00`);
          return slotHour === hour24;
        });

        if (selectedSlot) {
          console.log(`✅ Matched time "${userMessage}" to slot at ${hour24}:00`);
        } else {
          console.log(`❌ No slot found for ${hour24}:00 in available slots`);
        }
      }

      // If no time match, try index/number matching (but be careful not to match times like "1:00 PM")
      if (!selectedSlot && !timeMatch) {
        const slotMatch = userMessage.match(/\b([1-5])\b|first|second|third|fourth|fifth/i);
        if (slotMatch) {
          let slotIndex = -1;
          if (slotMatch[1]) {
            slotIndex = parseInt(slotMatch[1]) - 1;
          } else {
            const wordMap: any = { 'first': 0, 'second': 1, 'third': 2, 'fourth': 3, 'fifth': 4 };
            slotIndex = wordMap[slotMatch[0].toLowerCase()];
          }

          if (slotIndex >= 0 && slotIndex < calendarSlots.length) {
            selectedSlot = calendarSlots[slotIndex];
            console.log(`✅ Matched index ${slotIndex + 1} to slot`);
          }
        }
      }

      if (selectedSlot) {
        try {
          // Book the appointment
          const bookingResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/test-flow-calendar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
            body: JSON.stringify({
              action: 'book-appointment',
              slotStart: selectedSlot.start,
              slotEnd: selectedSlot.end,
              clientName: collectedInfo.name || collectedInfo.fullName || 'Client',
              clientEmail: collectedInfo.email || '',
              summary: `Call with ${collectedInfo.name || collectedInfo.fullName || 'Client'}`,
              description: `Scheduled call from conversation flow.\n\nCollected Information:\n${Object.entries(collectedInfo).map(([k, v]) => `${k}: ${v}`).join('\n')}`
            })
          });

          const bookingData = await bookingResponse.json();

          if (bookingData.success) {
            appointmentBooked = true;
            bookedAppointmentInfo = {
              time: bookingData.formattedTime,
              eventId: bookingData.eventId
            };
          }
        } catch (error) {
          console.error('Appointment booking error:', error);
        }
      }
    }

    // Build the AI prompt to determine the best response
    const collectedInfoText = Object.keys(collectedInfo).length > 0
      ? `\n\nINFORMATION ALREADY COLLECTED:\n${Object.entries(collectedInfo).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
      : '';

    const requiredQuestionsText = requiredQuestions.length > 0
      ? `\n\nREQUIRED QUESTIONS THAT MUST BE ANSWERED:\n${requiredQuestions.map((q: any) => `- ${q.question} (save as "${q.fieldName}")`).join('\n')}\n\n${
          allQuestionsAnswered
            ? 'ALL REQUIRED QUESTIONS HAVE BEEN ANSWERED! You can now proceed to the next step in the conversation flow.'
            : `You MUST ask these questions and collect this information. Check what's already collected and ask for what's missing.\n\nMISSING QUESTIONS:\n${missingQuestions.map((q: any) => `- ${q.question}`).join('\n')}`
        }`
      : '';

    const appointmentBookedText = appointmentBooked
      ? `\n\nAPPOINTMENT SUCCESSFULLY BOOKED!\nThe client selected a time and the appointment has been booked for: ${bookedAppointmentInfo.time}\nYou MUST confirm this booking in your response and thank them for scheduling.`
      : '';

    const prompt = `You are a sales agent in a text message conversation. You need to respond naturally to the client's message while following your conversation flow.

CONVERSATION CONTEXT:
${conversationHistory || 'This is the start of the conversation'}${collectedInfoText}${requiredQuestionsText}${appointmentBookedText}

YOUR LAST MESSAGE:
"${currentStep.yourMessage}"

CLIENT'S RESPONSE:
"${userMessage}"

YOUR AVAILABLE RESPONSES:
${currentStep.responses.map((r: any, i: number) => `${i}. ${r.label}: "${r.followUpMessage}"`).join('\n')}

YOUR TASK:
Analyze the client's response and determine the best way to respond:

1. What are they actually saying? (interested, hesitant, asking for info, objecting, not interested, asking to follow up later, etc.)
2. Does one of your available responses DIRECTLY and APPROPRIATELY address what they said?
   - If YES and it makes conversational sense, use that response
   - If NO or if it would sound awkward/off-topic, generate a custom response instead

IMPORTANT: Only use a preset response if it ACTUALLY addresses what the client said.
- If they ask "who are you?" and you have a "Need more info" response, DON'T use it - generate a custom intro instead
- If they say "yes" to your question, use the "Yes/Interested" response to continue
- If they ask a specific question none of your responses cover, generate a helpful custom answer
- If they say "not at the moment" or "can you text me later?", DON'T repeat your question - acknowledge their request and ask when would be good

CRITICAL RULE: ALWAYS ACKNOWLEDGE what the client just said before moving forward.
- Bad: Client says "not now, text me later" → You respond "Thanks! Could you share the ages..."
- Good: Client says "not now, text me later" → You respond "Of course! When would be a good time to follow up?"
- Bad: Client asks "who are you?" → You respond "Sure! What would you like to know?"
- Good: Client asks "who are you?" → You respond "I'm [name] helping you find health insurance. Are you currently looking for coverage?"

CRITICAL: ACTUALLY ANSWER THEIR QUESTIONS
- If they ask "what can you help me find?", DON'T say "What would you like to know?" - that's avoiding the question
- Instead, tell them WHAT you help with: "I help you find health insurance coverage that fits your needs and budget"
- If they ask a specific question, give a specific answer - don't deflect with another question
- Bad: "what can you help me find?" → "What specifically would you like to know?"
- Good: "what can you help me find?" → "I help you find health insurance coverage! Are you looking for yourself or your family?"

CRITICAL: NEVER ASK FOR INFORMATION YOU ALREADY HAVE
- If "Information Already Collected" shows you already know something, DON'T ask for it again
- Example: If you know "Number of people: 1" (or client said "myself"), DON'T ask "How many people need coverage?"
- Example: If you know "Current coverage: None", DON'T ask "What's your current coverage?"
- Example: If you know "householdIncome: 40000", DON'T ask "What's your household income?" again
- Use what you already know to have a natural conversation
- MOVE FORWARD to the next piece of information you need, don't loop back to what you already have

CONVERSATION FLOW RULES:
- Once you have an answer to a question, NEVER ask it again - move on to the next question
- If you already asked about household income and they answered, ask about something else (like zip code, coverage needs, etc.)
- Keep the conversation progressing forward, don't get stuck in loops
- Review the collected information before deciding what to ask next
- NEVER repeat your previous message - each response should be unique and move the conversation forward
- If you just asked something and they answered, acknowledge their answer and ask something NEW

CRITICAL: IF ALL REQUIRED QUESTIONS HAVE BEEN ANSWERED:
- DO NOT keep asking for more information
- DO NOT loop back to ask questions again
- You MUST use one of your preset responses that advances the conversation to the next step
- Choose the response that best acknowledges you have all the information needed
- Example: Use "Interested" or "Yes" response to move forward in the flow

EXTRACT KEY INFORMATION from the client's responses:
${requiredQuestions.length > 0 ? `
CRITICAL: When extracting information for required questions, you MUST use EXACTLY these field names:
${requiredQuestions.map((q: any) => `- For "${q.question}" use field name: "${q.fieldName}"`).join('\n')}

DO NOT make up your own field names! Use the EXACT field names listed above.
For example:
- If the field name is "income", use "income" NOT "householdIncome"
- If the field name is "householdMembers", use "householdMembers" exactly
` : ''}
- Look for: number of people, coverage type, budget, timeline, current coverage, ages, gender, location, zip code, etc.
- Example: "im looking for coverage for myself" → Extract: Number of people = 1
- Example: "i dont have any" (about coverage) → Extract: Current coverage = None
- Example: "my wife and 2 kids" → Extract: Number of people = 4 (including client)
- Example: "35m, 34f, 12f, 6m" → Extract: "Ages and genders": "35 (Male), 34 (Female), 12 (Female), 6 (Male)", "Number of people": "4"
- Example: "32776" or "zip is 32776" → Extract: "Zip code": "32776"
- Parse gender notation: "m" = Male, "f" = Female
- IMPORTANT: All values in extractedInfo MUST be strings, never objects or arrays
- Return extracted info in the "extractedInfo" field with clear, readable formatting

When generating custom responses:
- FIRST: Acknowledge what they said (show you heard them)
- THEN: Respond appropriately to their specific situation
- Don't just blindly follow the script if it doesn't make sense
- Keep it conversational and natural - don't sound robotic

Think like a real person having a conversation, not a script reader.

Return ONLY valid JSON (no markdown):
{
  "matchedResponseIndex": <number 0 to ${currentStep.responses.length - 1}, OR null if generating custom>,
  "customResponse": "<your custom response text, only if matchedResponseIndex is null>",
  "customDrips": [
    {
      "message": "First follow-up if no response after 3-4 hours",
      "delayHours": 3
    },
    {
      "message": "Second follow-up if still no response",
      "delayHours": 27
    }
  ],
  "extractedInfo": {
    "key": "value as string only"
  },
  "reasoning": "<1-2 sentences explaining your choice>"
}

CRITICAL: You MUST ALWAYS provide customDrips array with 2-3 contextual follow-up messages.
- Whether you use a preset response OR generate a custom one, ALWAYS include drips
- The drips should be contextual to what was just said and help re-engage if the client doesn't reply
- Make drips natural and conversational, not pushy`;

    const apiKey = process.env.OPENAI_API_KEY;

    // Build system message
    const systemMessage = "You are a sales agent who reads conversations carefully and responds appropriately. Think about what the client is really saying and what makes sense to say next. Return only valid JSON, no markdown.";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
    }

    const completion = await response.json();
    const responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      return NextResponse.json(
        { error: "Failed to generate response" },
        { status: 500 }
      );
    }

    // Clean up potential markdown formatting
    let cleanedResponse = responseText;
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    try {
      const aiDecision = JSON.parse(cleanedResponse);

      // Determine the next step index
      const currentStepIndex = allSteps.findIndex((s: any) => s.id === currentStep.id);
      let nextStepIndex = currentStepIndex;
      let agentResponse = "";
      let shouldMoveToNextStep = false;

      // Check if AI generated a custom response
      if (aiDecision.matchedResponseIndex === null && aiDecision.customResponse) {
        agentResponse = aiDecision.customResponse;
        console.log('🤖 AI custom response:', agentResponse);

        // If calendar is enabled and all questions answered, check if response contains time mentions
        console.log('🔍 Checking override conditions:', {
          requiresCall,
          calendarSlotsLength: calendarSlots.length,
          allQuestionsAnswered
        });

        if (requiresCall && allQuestionsAnswered) {
          if (calendarSlots.length > 0) {
            // Take first 2-3 available slots (already filtered for future times)
            const slotsToShow = calendarSlots.slice(0, 3);
            const timesList = slotsToShow.map(s => {
              const timeMatch = s.formatted.match(/at (.+)$/);
              return timeMatch ? timeMatch[1] : s.formatted;
            }).join(', ');

            console.log(`✅ OVERRIDE TRIGGERED! Showing ${slotsToShow.length} available times: ${timesList}`);
            agentResponse = `Great! I have availability at: ${timesList}. Which time works best for you?`;
          } else {
            console.log('❌ No calendar slots available - showing error message');
            agentResponse = `I apologize, but I'm unable to access my calendar at the moment. Please try again shortly.`;
          }
        } else if (requiresCall && calendarSlots.length > 0) {
          // Even if not all questions answered, if the response mentions times, replace them
          const hasFakeTimes = /\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)|\d{1,2}\s*(?:AM|PM|am|pm)/i.test(agentResponse);
          if (hasFakeTimes) {
            console.log('⚠️ Detected fake times in response, replacing with real calendar slots');
            const slotsToShow = calendarSlots.slice(0, 3);
            const timesList = slotsToShow.map(s => {
              const timeMatch = s.formatted.match(/at (.+)$/);
              return timeMatch ? timeMatch[1] : s.formatted;
            }).join(', ');
            agentResponse = `Great! I have availability at: ${timesList}. Which time works best for you?`;
          } else {
            console.log('❌ OVERRIDE NOT TRIGGERED - Using AI response as-is');
          }
        } else if (requiresCall && calendarSlots.length === 0 && allQuestionsAnswered) {
          console.log('❌ No calendar slots available - showing error message');
          agentResponse = `I apologize, but I'm unable to access my calendar at the moment. Please try again shortly.`;
        } else {
          console.log('❌ OVERRIDE NOT TRIGGERED - Using AI response as-is');
        }

        nextStepIndex = currentStepIndex;
      } else {
        // Get the matched response
        const matchedResponse = currentStep.responses[aiDecision.matchedResponseIndex];

        if (!matchedResponse) {
          return NextResponse.json({
            error: "Invalid response index"
          }, { status: 400 });
        }

        // Always use the followUpMessage for the matched response
        agentResponse = matchedResponse.followUpMessage;
        console.log('🎯 Matched response:', agentResponse);

        // If calendar is enabled, check if response contains time mentions
        console.log('🔍 Checking override conditions (matched path):', {
          requiresCall,
          calendarSlotsLength: calendarSlots.length,
          allQuestionsAnswered
        });

        if (requiresCall && allQuestionsAnswered) {
          if (calendarSlots.length > 0) {
            // Take first 2-3 available slots (already filtered for future times)
            const slotsToShow = calendarSlots.slice(0, 3);
            const timesList = slotsToShow.map(s => {
              const timeMatch = s.formatted.match(/at (.+)$/);
              return timeMatch ? timeMatch[1] : s.formatted;
            }).join(', ');

            console.log(`✅ OVERRIDE TRIGGERED (matched path)! Showing ${slotsToShow.length} available times: ${timesList}`);
            agentResponse = `Great! I have availability at: ${timesList}. Which time works best for you?`;
          } else {
            console.log('❌ No calendar slots available (matched path) - showing error message');
            agentResponse = `I apologize, but I'm unable to access my calendar at the moment. Please try again shortly.`;
          }
        } else if (requiresCall && calendarSlots.length > 0) {
          // Even if not all questions answered, if the response mentions times, replace them
          const hasFakeTimes = /\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)|\d{1,2}\s*(?:AM|PM|am|pm)/i.test(agentResponse);
          if (hasFakeTimes) {
            console.log('⚠️ Detected fake times in matched response, replacing with real calendar slots');
            const slotsToShow = calendarSlots.slice(0, 3);
            const timesList = slotsToShow.map(s => {
              const timeMatch = s.formatted.match(/at (.+)$/);
              return timeMatch ? timeMatch[1] : s.formatted;
            }).join(', ');
            agentResponse = `Great! I have availability at: ${timesList}. Which time works best for you?`;
          } else {
            console.log('❌ OVERRIDE NOT TRIGGERED (matched path) - Using response as-is');
          }
        } else if (requiresCall && calendarSlots.length === 0 && allQuestionsAnswered) {
          console.log('❌ No calendar slots available (matched path) - showing error message');
          agentResponse = `I apologize, but I'm unable to access my calendar at the moment. Please try again shortly.`;
        } else {
          console.log('❌ OVERRIDE NOT TRIGGERED (matched path) - Using response as-is');
        }

        // Check if this response has a nextStepId to follow for FUTURE messages
        if (matchedResponse.nextStepId) {
          const targetStepIndex = allSteps.findIndex((s: any) => s.id === matchedResponse.nextStepId);
          if (targetStepIndex >= 0) {
            // We'll advance to this step, but keep showing the followUp message now
            nextStepIndex = targetStepIndex;
            shouldMoveToNextStep = true;
          } else {
            // Invalid nextStepId, stay on current step
            nextStepIndex = currentStepIndex;
          }
        } else {
          // No nextStepId means we stay on current step
          nextStepIndex = currentStepIndex;
        }
      }

      return NextResponse.json({
        agentResponse: agentResponse,
        nextStepIndex: nextStepIndex,
        reasoning: aiDecision.reasoning,
        matchedResponseIndex: aiDecision.matchedResponseIndex,
        shouldAdvanceToNextStep: shouldMoveToNextStep,
        isCustomResponse: aiDecision.matchedResponseIndex === null,
        customDrips: aiDecision.customDrips || [],
        extractedInfo: aiDecision.extractedInfo || {},
        availableSlots: calendarSlots,
        appointmentBooked: appointmentBooked,
        appointmentInfo: bookedAppointmentInfo
      });

    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      console.error("Raw response:", responseText);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in test flow response:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
