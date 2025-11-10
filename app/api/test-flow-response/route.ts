import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from 'googleapis';
import { DateTime } from "luxon";

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

    // Check if we have at least as many collected fields as required questions
    // Since AI generates field names dynamically, we just need to ensure we've collected enough info
    const collectedFieldsCount = Object.keys(collectedInfo).length;
    const requiredQuestionsCount = requiredQuestions.length;
    const allQuestionsAnswered = requiredQuestionsCount > 0 && collectedFieldsCount >= requiredQuestionsCount;

    console.log('🔍 DEBUG - Required questions:', requiredQuestionsCount);
    console.log('🔍 DEBUG - Required questions list:', requiredQuestions.map((q: any) => q.question));
    console.log('🔍 DEBUG - Collected fields count:', collectedFieldsCount);
    console.log('🔍 DEBUG - All questions answered?', allQuestionsAnswered, `(${collectedFieldsCount} >= ${requiredQuestionsCount})`);
    console.log('🔍 DEBUG - Collected info keys:', Object.keys(collectedInfo));
    console.log('🔍 DEBUG - Collected info:', JSON.stringify(collectedInfo));

    // If flow requires call, check calendar availability
    // Fetch calendar slots even if not all questions answered yet, so they're ready when needed
    let calendarSlots: any[] = [];
    if (requiresCall) {
      try {
        // Get user's Google Calendar tokens from database
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry')
          .eq('id', user.id)
          .single();

        if (userError || !userData?.google_calendar_refresh_token) {
          console.log('📅 Google Calendar not connected for user');
        } else {
          // Set up OAuth client
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/oauth/callback`
          );

          oauth2Client.setCredentials({
            access_token: userData.google_calendar_access_token,
            refresh_token: userData.google_calendar_refresh_token,
            expiry_date: userData.google_calendar_token_expiry ? new Date(userData.google_calendar_token_expiry).getTime() : undefined
          });

          // Set up token refresh handler
          oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token) {
              await supabase
                .from('users')
                .update({
                  google_calendar_access_token: tokens.access_token,
                  google_calendar_refresh_token: tokens.refresh_token,
                  google_calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
                })
                .eq('id', user.id);
            } else if (tokens.access_token) {
              await supabase
                .from('users')
                .update({
                  google_calendar_access_token: tokens.access_token,
                  google_calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
                })
                .eq('id', user.id);
            }
          });

          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          const tz = process.env.TIMEZONE || "America/New_York";
          const SLOT_DURATION_MIN = 30;

          let day = DateTime.now().setZone(tz).startOf("day");
          let slots: any[] = [];

          // Look up to 14 days ahead for 3 available slots
          for (let i = 0; i < 14 && slots.length < 3; i++) {
            const dayStart = day.plus({ days: i }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 });
            const dayEnd = day.plus({ days: i }).set({ hour: 17, minute: 0, second: 0, millisecond: 0 });

            const eventsRes = await calendar.events.list({
              calendarId: 'primary',
              timeMin: dayStart.toISO() as string,
              timeMax: dayEnd.toISO() as string,
              singleEvents: true,
              orderBy: "startTime",
            });

            const events = eventsRes.data.items || [];

            const busy: Array<{ start: DateTime; end: DateTime }> = events
              .filter(e => e.start?.dateTime && e.end?.dateTime)
              .map(e => ({
                start: DateTime.fromISO(e.start!.dateTime!).setZone(tz),
                end: DateTime.fromISO(e.end!.dateTime!).setZone(tz),
              }));

            let slotTime = dayStart;
            while (slotTime < dayEnd && slots.length < 3) {
              const slotEnd = slotTime.plus({ minutes: SLOT_DURATION_MIN });

              const overlaps = busy.some(b => {
                return slotTime < b.end && slotEnd > b.start;
              });

              if (!overlaps && slotTime > DateTime.now().setZone(tz)) {
                slots.push({
                  start: slotTime.toISO(),
                  end: slotEnd.toISO(),
                  display: slotTime.toFormat("h:mm a"),
                  day: slotTime.toFormat("ccc, MMM d"),
                  formatted: `${slotTime.toFormat("ccc, MMM d")} at ${slotTime.toFormat("h:mm a")}`,
                });
              }

              slotTime = slotTime.plus({ minutes: SLOT_DURATION_MIN });
            }
          }

          calendarSlots = slots;
          console.log(`📅 Found ${calendarSlots.length} available slots`);
        }
      } catch (error) {
        console.error('Calendar check error:', error);
      }
    }

    // Check if calendar times have been shown to user
    // Only allow booking AFTER we've shown the times in a previous response
    const calendarTimesShown = conversationHistory && conversationHistory.includes('Which time works best for you?');

    // Check if user is selecting a time slot
    let appointmentBooked = false;
    let bookedAppointmentInfo: any = null;

    // ONLY check for booking if calendar times were already shown in conversation
    if (requiresCall && calendarSlots.length > 0 && userMessage && calendarTimesShown) {
      let selectedSlot = null;

      console.log(`🔍 Checking if "${userMessage}" is selecting a time from ${calendarSlots.length} available slots`);

      // Try to detect if user is selecting a time by:
      // 1. Time format (e.g., "1pm", "2:00", "3 PM", "10:00 AM")
      // 2. Index/number (e.g., "1", "option 2", "the first one")

      // First, try to match specific time mentions like "1pm", "2pm", "3:00 PM", "1030", "930", etc.
      // Try matching with AM/PM first
      let timeMatch = userMessage.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i);

      // If no AM/PM match, try matching 3-4 digit time format like "930" or "1030"
      if (!timeMatch) {
        const shortMatch = userMessage.match(/\b(\d{3,4})\b/);
        if (shortMatch) {
          const timeStr = shortMatch[1].padStart(4, '0'); // "930" -> "0930"
          const hour = parseInt(timeStr.substring(0, 2));
          const minute = parseInt(timeStr.substring(2, 4));

          // Only consider valid times (hour 0-23, minute 0-59)
          if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            // For times without AM/PM, match against available slots
            console.log(`🕐 Trying to match short time format "${shortMatch[1]}" (${hour}:${minute.toString().padStart(2, '0')})`);

            selectedSlot = calendarSlots.find((slot: any) => {
              const displayMatch = slot.display.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
              if (displayMatch) {
                let slotHour = parseInt(displayMatch[1]);
                const slotMinute = parseInt(displayMatch[2]);
                const slotPeriod = displayMatch[3].toLowerCase();

                if (slotPeriod === 'pm' && slotHour !== 12) {
                  slotHour += 12;
                } else if (slotPeriod === 'am' && slotHour === 12) {
                  slotHour = 0;
                }

                const matches = slotHour === hour && slotMinute === minute;
                console.log(`  - Checking slot "${slot.display}" (${slotHour}:${slotMinute.toString().padStart(2, '0')}) against ${hour}:${minute.toString().padStart(2, '0')}: ${matches ? 'MATCH' : 'no match'}`);
                return matches;
              }
              return false;
            });

            if (selectedSlot) {
              console.log(`✅ Matched short time "${shortMatch[1]}" to slot: ${selectedSlot.display}`);
            }
          }
        }
      }

      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const period = timeMatch[3].toLowerCase();

        // Convert to 24-hour format
        let hour24 = hour;
        if (period === 'pm' && hour !== 12) {
          hour24 = hour + 12;
        } else if (period === 'am' && hour === 12) {
          hour24 = 0;
        }

        console.log(`🕐 Looking for ${hour24}:${minute.toString().padStart(2, '0')} (from "${userMessage}")`);

        // Find the slot that matches this time from the CURRENT calendar slots
        // Use timezone-aware comparison with the display time, not the UTC time
        selectedSlot = calendarSlots.find((slot: any) => {
          // Parse the slot's display time (e.g., "9:00 AM", "10:30 AM")
          const displayMatch = slot.display.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
          if (displayMatch) {
            let slotHour = parseInt(displayMatch[1]);
            const slotMinute = parseInt(displayMatch[2]);
            const slotPeriod = displayMatch[3].toLowerCase();

            // Convert slot display time to 24-hour
            if (slotPeriod === 'pm' && slotHour !== 12) {
              slotHour += 12;
            } else if (slotPeriod === 'am' && slotHour === 12) {
              slotHour = 0;
            }

            const matches = slotHour === hour24 && slotMinute === minute;
            console.log(`  - Checking slot display "${slot.display}" (${slotHour}:${slotMinute.toString().padStart(2, '0')}) against ${hour24}:${minute.toString().padStart(2, '0')}: ${matches ? 'MATCH' : 'no match'}`);
            return matches;
          }
          return false;
        });

        if (selectedSlot) {
          console.log(`✅ Matched time "${userMessage}" to slot: ${selectedSlot.display}`);
        } else {
          console.log(`❌ No slot found for ${hour24}:${minute.toString().padStart(2, '0')} in available slots`);
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
          // Book the appointment directly using authenticated calendar API
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry')
            .eq('id', user.id)
            .single();

          if (!userError && userData?.google_calendar_refresh_token) {
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/oauth/callback`
            );

            oauth2Client.setCredentials({
              access_token: userData.google_calendar_access_token,
              refresh_token: userData.google_calendar_refresh_token,
              expiry_date: userData.google_calendar_token_expiry ? new Date(userData.google_calendar_token_expiry).getTime() : undefined
            });

            oauth2Client.on('tokens', async (tokens) => {
              if (tokens.refresh_token) {
                await supabase
                  .from('users')
                  .update({
                    google_calendar_access_token: tokens.access_token,
                    google_calendar_refresh_token: tokens.refresh_token,
                    google_calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
                  })
                  .eq('id', user.id);
              } else if (tokens.access_token) {
                await supabase
                  .from('users')
                  .update({
                    google_calendar_access_token: tokens.access_token,
                    google_calendar_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
                  })
                  .eq('id', user.id);
              }
            });

            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            // Re-check to avoid double booking
            const conflictCheck = await calendar.events.list({
              calendarId: 'primary',
              timeMin: selectedSlot.start,
              timeMax: selectedSlot.end,
              singleEvents: true,
              orderBy: "startTime",
            });

            if ((conflictCheck.data.items || []).length === 0) {
              const event = {
                summary: `Call with ${collectedInfo.name || collectedInfo.fullName || "Prospect"}`,
                description: collectedInfo.phone ? `Phone: ${collectedInfo.phone}` : "",
                start: { dateTime: selectedSlot.start },
                end: { dateTime: selectedSlot.end },
                attendees: collectedInfo.email ? [{ email: collectedInfo.email }] : [],
              };

              const created = await calendar.events.insert({
                calendarId: 'primary',
                requestBody: event,
              });

              console.log(`✅ Booked appointment: ${created.data.id}`);

              const bookingData = { ok: true, eventId: created.data.id };

              if (bookingData.ok) {
                appointmentBooked = true;
                bookedAppointmentInfo = {
                  time: selectedSlot.formatted || selectedSlot.display,
                  eventId: bookingData.eventId
                };
              }
            } else {
              console.log('❌ Time slot already booked by someone else');
            }
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

    // If calendar is enabled and all questions are answered, prepare calendar times info
    const showCalendarTimes = requiresCall && allQuestionsAnswered && !appointmentBooked && calendarSlots.length > 0;
    const calendarTimesText = showCalendarTimes
      ? `\n\n📅 CALENDAR TIMES AVAILABLE:\nThe following times are available: ${calendarSlots.slice(0, 3).map(s => {
          const timeMatch = s.formatted.match(/at (.+)$/);
          return timeMatch ? timeMatch[1] : s.formatted;
        }).join(', ')}\nYou MUST include these times in your response and ask which one works best.`
      : '';

    const requiredQuestionsText = requiredQuestions.length > 0
      ? `\n\nREQUIRED QUESTIONS THAT MUST BE ANSWERED:\n${requiredQuestions.map((q: any) => `- ${q.question}`).join('\n')}\n\n${
          allQuestionsAnswered
            ? `ALL REQUIRED QUESTIONS HAVE BEEN ANSWERED!${showCalendarTimes ? ' Since calendar is enabled, you MUST show the available times listed above in your response.' : ' You can now proceed to the next step in the conversation flow.'}`
            : `⚠️ CRITICAL: You have collected ${collectedFieldsCount} out of ${requiredQuestionsCount} required answers. You MUST ask the NEXT unanswered question immediately. DO NOT mention calendar availability, DO NOT say you'll get back to them, DO NOT ask if they have other questions. Your ONLY job right now is to ask the next required question from the list above. Ask it NOW in your response.`
        }`
      : '';

    const appointmentBookedText = appointmentBooked
      ? `\n\nAPPOINTMENT SUCCESSFULLY BOOKED!\nThe client selected a time and the appointment has been booked for: ${bookedAppointmentInfo.time}\nYou MUST confirm this booking in your response and thank them for scheduling.`
      : '';

    const prompt = `You are a sales agent in a text message conversation. You need to respond naturally to the client's message while following your conversation flow.

CONVERSATION CONTEXT:
${conversationHistory || 'This is the start of the conversation'}${collectedInfoText}${calendarTimesText}${requiredQuestionsText}${appointmentBookedText}

YOUR LAST MESSAGE:
"${currentStep.yourMessage}"

${Object.keys(collectedInfo).length > 0 ? `
⚠️ CRITICAL WARNING: Your last message above may ask for information you ALREADY HAVE.
IGNORE that part of the message if you already collected that information!
Instead, acknowledge their answer and ask for something you DON'T have yet.
For example:
- If you asked "What's your income?" and they answered, and you already have "income" in collected info, DON'T ask for income again!
- Instead say: "Thanks for that info! Now, could you tell me [something you DON'T have yet]?"
` : ''}

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

🚨 CRITICAL: NEVER ASK FOR INFORMATION YOU ALREADY HAVE 🚨
**BEFORE YOU GENERATE YOUR RESPONSE:**
1. LOOK at the "INFORMATION ALREADY COLLECTED" section above
2. CHECK what information is already there
3. DO NOT ask for anything that's already collected - asking again is a CRITICAL ERROR

EXAMPLES OF WHAT NOT TO DO:
- ❌ BAD: "householdIncome: 24k" is collected → You ask "What's your household income?"
- ❌ BAD: "householdMembers: 3" is collected → You ask "How many people are in your household?"
- ❌ BAD: "name: John" is collected → You ask "What's your name?"

WHAT TO DO INSTEAD:
- ✅ GOOD: Check collected info first, then ask for MISSING information only
- ✅ GOOD: If you have income and members, ask for something NEW like zip code, coverage type, etc.
- ✅ GOOD: Use what you already know to sound natural: "Thanks John! Since you mentioned 3 people..."

**MANDATORY PRE-RESPONSE CHECKLIST:**
Before generating your response, ask yourself:
1. "What information do I ALREADY have?" (Check INFORMATION ALREADY COLLECTED section)
2. "What information am I STILL MISSING?" (Check REQUIRED QUESTIONS section)
3. "Am I about to ask for something I already know?" (If YES, STOP and ask something else!)

CONVERSATION FLOW RULES:
- Once you have an answer to a question, NEVER ask it again - move on to the next question
- If you already asked about household income and they answered, ask about something else (like zip code, coverage needs, etc.)
- Keep the conversation progressing forward, don't get stuck in loops
- Review the collected information before deciding what to ask next
- NEVER repeat your previous message - each response should be unique and move the conversation forward
- If you just asked something and they answered, acknowledge their answer and ask something NEW
- ASKING A DUPLICATE QUESTION IS THE WORST MISTAKE YOU CAN MAKE - Always check collected info first!

CRITICAL: IF ALL REQUIRED QUESTIONS HAVE BEEN ANSWERED:
- DO NOT keep asking for more information
- DO NOT loop back to ask questions again
- You MUST use one of your preset responses that advances the conversation to the next step
- Choose the response that best acknowledges you have all the information needed
- Example: Use "Interested" or "Yes" response to move forward in the flow

EXTRACT KEY INFORMATION from the client's responses:
${requiredQuestions.length > 0 ? `
REQUIRED QUESTIONS TO TRACK:
${requiredQuestions.map((q: any, i: number) => `${i + 1}. "${q.question}"`).join('\n')}

When you extract information that answers one of these questions, create a clear camelCase field name that describes what you're collecting.
` : ''}
- Extract any relevant information from the client's response
- All values in extractedInfo MUST be strings, never objects or arrays
- Return extracted info in the "extractedInfo" field

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

        // Override AI response with calendar times when appropriate
        // Check calendar-related messages FIRST, regardless of allQuestionsAnswered status
        if (appointmentBooked) {
          // If appointment was just booked, keep the AI's natural acknowledgment
          console.log('✅ Appointment booked - keeping AI response');
        } else if (requiresCall && calendarSlots.length > 0 && !calendarTimesShown && /check.*calendar|calendar.*check|send you.*available times|available times.*shortly|let me check|checking my|i'll send|showing.*times|get back to you.*information|more information shortly/i.test(agentResponse)) {
          // If response mentions checking calendar or sending times, replace with actual times
          // This runs FIRST to catch AI-generated calendar messages regardless of question status
          console.log('🔄 Replacing calendar-related message with actual times (detected message pattern)');
          const slotsToShow = calendarSlots.slice(0, 3);
          const timesList = slotsToShow.map(s => {
            const timeMatch = s.formatted.match(/at (.+)$/);
            return timeMatch ? timeMatch[1] : s.formatted;
          }).join(', ');
          agentResponse = `Perfect! I have availability at: ${timesList}. Which time works best for you?`;
        } else if (requiresCall && allQuestionsAnswered && !calendarTimesShown && calendarSlots.length > 0) {
          // All questions answered and times NOT shown yet - FORCE show times immediately
          console.log('🎯 TRIGGERING CALENDAR OVERRIDE - All questions answered, showing times now');
          const slotsToShow = calendarSlots.slice(0, 3);
          const timesList = slotsToShow.map(s => {
            const timeMatch = s.formatted.match(/at (.+)$/);
            return timeMatch ? timeMatch[1] : s.formatted;
          }).join(', ');
          agentResponse = `Perfect! I have availability at: ${timesList}. Which time works best for you?`;
        } else if (requiresCall && allQuestionsAnswered && !appointmentBooked && calendarSlots.length === 0) {
          console.log('❌ No calendar slots available - showing error message');
          agentResponse = `I apologize, but I'm unable to access my calendar at the moment. Please try again shortly.`;
        } else if (requiresCall && calendarSlots.length > 0 && !allQuestionsAnswered) {
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
          }
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

        // Check calendar-related messages FIRST, regardless of allQuestionsAnswered status
        if (requiresCall && calendarSlots.length > 0 && !calendarTimesShown && /check.*calendar|calendar.*check|send you.*available times|available times.*shortly|let me check|checking my|i'll send|showing.*times|get back to you.*information|more information shortly/i.test(agentResponse)) {
          // If response mentions checking calendar or sending times, replace with actual times
          console.log('🔄 Replacing calendar-related message with actual times (matched path - detected pattern)');
          const slotsToShow = calendarSlots.slice(0, 3);
          const timesList = slotsToShow.map(s => {
            const timeMatch = s.formatted.match(/at (.+)$/);
            return timeMatch ? timeMatch[1] : s.formatted;
          }).join(', ');
          agentResponse = `Great! I have availability at: ${timesList}. Which time works best for you?`;
        } else if (requiresCall && allQuestionsAnswered && !calendarTimesShown) {
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

      // Log extracted info for debugging
      if (aiDecision.extractedInfo && Object.keys(aiDecision.extractedInfo).length > 0) {
        console.log('📝 AI extracted info field names:', Object.keys(aiDecision.extractedInfo));
        console.log('📝 AI extracted info:', JSON.stringify(aiDecision.extractedInfo));
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
