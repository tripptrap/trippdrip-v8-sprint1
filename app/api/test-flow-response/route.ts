import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from 'googleapis';
import { DateTime } from "luxon";
import { validateAndFixResponse, logQualityMetrics } from "@/lib/ai/responseQuality";
import {
  upsertLeadFromConversation,
  createSession,
  updateSession,
  completeSession,
  trackLeadActivity
} from "@/lib/conversations/sessionManager";
import { generateTemplatedResponse } from "@/lib/ai/templates";

export const dynamic = "force-dynamic";

// Helper function to strip markdown bold formatting from responses
function stripMarkdownBold(text: string): string {
  // Remove **bold** and __bold__ markdown syntax
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { userMessage, currentStep, allSteps, conversationHistory, collectedInfo = {}, requiredQuestions = [], requiresCall = false, sessionId, flowId } = await req.json();

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

    // LEAD & SESSION TRACKING
    let currentSessionId: string | null = sessionId || null;
    let currentLeadId: string | null = null;

    // Create or update lead from collected info (if we have any data)
    if (collectedFieldsCount > 0 && flowId) {
      try {
        const { leadId } = await upsertLeadFromConversation(user.id, collectedInfo, flowId);
        currentLeadId = leadId;
        console.log('📊 Lead tracked:', leadId ? 'updated/created' : 'failed');
      } catch (error) {
        console.error('Error upserting lead:', error);
        // Continue anyway - lead tracking shouldn't block conversation
      }
    }

    // Create session on first message (no sessionId provided)
    if (!currentSessionId && collectedFieldsCount === 0 && flowId) {
      try {
        const { sessionId: newSessionId } = await createSession(user.id, {
          flowId,
          leadId: currentLeadId || undefined,
          collectedInfo,
          conversationHistory
        });
        currentSessionId = newSessionId;
        console.log('📊 Session created:', newSessionId);
      } catch (error) {
        console.error('Error creating session:', error);
      }
    }

    // Update existing session with latest state
    if (currentSessionId) {
      try {
        await updateSession(user.id, currentSessionId, {
          collectedInfo,
          conversationHistory,
          leadId: currentLeadId || undefined
        });
        console.log('📊 Session updated:', currentSessionId);
      } catch (error) {
        console.error('Error updating session:', error);
      }
    }

    console.log('🔍 DEBUG - Required questions:', requiredQuestionsCount);
    console.log('🔍 DEBUG - Required questions list:', requiredQuestions.map((q: any) => q.question));
    console.log('🔍 DEBUG - Collected fields count:', collectedFieldsCount);
    console.log('🔍 DEBUG - All questions answered?', allQuestionsAnswered, `(${collectedFieldsCount} >= ${requiredQuestionsCount})`);
    console.log('🔍 DEBUG - Collected info keys:', Object.keys(collectedInfo));
    console.log('🔍 DEBUG - Collected info:', JSON.stringify(collectedInfo));
    console.log('🔍 DEBUG - requiresCall:', requiresCall);

    // OPTIMIZATION: Fetch user calendar data once if calendar is required
    // This avoids duplicate database queries for calendar slots AND booking
    // Calendar slots are cached for the entire request duration (no re-fetch on each message)
    let userData: any = null;
    let oauth2Client: any = null;
    let calendarSlots: any[] = [];

    if (requiresCall) {
      try {
        // Get user's Google Calendar tokens from database ONCE
        const { data: fetchedUserData, error: userError } = await supabase
          .from('users')
          .select('google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry')
          .eq('id', user.id)
          .single();

        if (userError || !fetchedUserData?.google_calendar_refresh_token) {
          console.log('📅 Google Calendar not connected for user');
        } else {
          // Cache userData for reuse in booking
          userData = fetchedUserData;
          // Set up OAuth client and cache it for reuse
          oauth2Client = new google.auth.OAuth2(
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
          oauth2Client.on('tokens', async (tokens: any) => {
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
          // OPTIMIZATION: Reuse cached userData and oauth2Client instead of refetching
          if (userData && oauth2Client) {
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
              // Build detailed description with all collected info
              let descriptionParts: string[] = [];

              // Add each collected field to description
              Object.entries(collectedInfo).forEach(([key, value]) => {
                if (value && typeof value === 'string') {
                  // Format key as Title Case
                  const formattedKey = key.replace(/([A-Z])/g, ' $1').trim()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
                  descriptionParts.push(`${formattedKey}: ${value}`);
                }
              });

              const event = {
                summary: `Call with ${collectedInfo.name || collectedInfo.fullName || "Prospect"}`,
                description: descriptionParts.length > 0 ? descriptionParts.join('\n') : "New prospect call",
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

                // Complete session and track activity
                if (currentSessionId) {
                  try {
                    await completeSession(
                      user.id,
                      currentSessionId,
                      true,
                      selectedSlot.start,
                      bookingData.eventId || undefined
                    );
                    console.log('📊 Session completed:', currentSessionId);
                  } catch (error) {
                    console.error('Error completing session:', error);
                  }
                }

                if (currentLeadId) {
                  try {
                    await trackLeadActivity(
                      user.id,
                      currentLeadId,
                      'appointment_scheduled',
                      `Appointment scheduled for ${selectedSlot.formatted || selectedSlot.display}`,
                      {
                        eventId: bookingData.eventId,
                        time: selectedSlot.start
                      }
                    );
                    console.log('📊 Activity tracked: appointment_scheduled');
                  } catch (error) {
                    console.error('Error tracking activity:', error);
                  }
                }
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

    // Build collected info section prominently at the top
    const collectedInfoKeys = Object.keys(collectedInfo);
    const hasCollectedInfo = collectedInfoKeys.length > 0;

    // Determine what questions are still unanswered
    const answeredQuestionKeywords = collectedInfoKeys.map(k => k.toLowerCase());
    const unansweredQuestions = requiredQuestions.filter((q: any) => {
      const questionLower = q.question.toLowerCase();
      // Check if any collected key might match this question
      return !answeredQuestionKeywords.some(key =>
        questionLower.includes(key) ||
        key.includes(questionLower.split(' ')[0]) ||
        // Check for common mappings
        (key === 'income' && questionLower.includes('income')) ||
        (key === 'householdincome' && questionLower.includes('income')) ||
        (key === 'householdmembers' && (questionLower.includes('household') || questionLower.includes('people') || questionLower.includes('members'))) ||
        (key === 'name' && questionLower.includes('name')) ||
        (key === 'email' && questionLower.includes('email')) ||
        (key === 'phone' && questionLower.includes('phone')) ||
        (key === 'zipcode' && (questionLower.includes('zip') || questionLower.includes('location')))
      );
    });

    // If calendar is enabled and all questions are answered, prepare calendar times info
    const showCalendarTimes = requiresCall && allQuestionsAnswered && !appointmentBooked && calendarSlots.length > 0;

    console.log('📅 CALENDAR DEBUG:', {
      requiresCall,
      allQuestionsAnswered,
      appointmentBooked,
      calendarSlotsCount: calendarSlots.length,
      showCalendarTimes,
      unansweredQuestionsCount: unansweredQuestions.length
    });

    const calendarTimesText = showCalendarTimes
      ? `\n\n📅 CALENDAR TIMES AVAILABLE - YOU MUST SHOW THESE:\n${calendarSlots.slice(0, 3).map(s => s.formatted).join(', ')}\n\nINCLUDE THESE EXACT TIMES in your response and ask which one works best!`
      : '';

    const appointmentBookedText = appointmentBooked
      ? `\n\n✅ APPOINTMENT BOOKED for ${bookedAppointmentInfo.time}! Confirm the booking and thank them.`
      : '';

    // Build a much simpler, more focused prompt
    const prompt = `You are a sales agent texting a client. Read carefully and respond appropriately.

${hasCollectedInfo ? `
═══════════════════════════════════════════════════════════════
🚨 STOP! READ THIS FIRST - INFORMATION YOU ALREADY HAVE:
═══════════════════════════════════════════════════════════════
${Object.entries(collectedInfo).map(([k, v]) => `✓ ${k}: ${v}`).join('\n')}

⛔ DO NOT ASK FOR ANY OF THE ABOVE INFORMATION AGAIN!
═══════════════════════════════════════════════════════════════
` : ''}
${requiredQuestions.length > 0 ? `
QUESTIONS STILL NEEDED (ask these one at a time):
${unansweredQuestions.length > 0
  ? unansweredQuestions.map((q: any, i: number) => `${i + 1}. ${q.question}`).join('\n')
  : '✅ ALL QUESTIONS ANSWERED - proceed to scheduling/next step'}
` : ''}${calendarTimesText}${appointmentBookedText}

CONVERSATION SO FAR:
${conversationHistory || 'Starting conversation'}

CLIENT JUST SAID: "${userMessage}"

YOUR AVAILABLE RESPONSES:
${currentStep.responses.map((r: any, i: number) => `${i}. ${r.label}: "${r.followUpMessage}"`).join('\n')}

RULES:
1. ${hasCollectedInfo ? 'NEVER ask for info you already have (see list above)' : 'Collect required information naturally'}
2. Acknowledge what the client said before asking the next question
3. Keep responses short (1-2 sentences max for SMS)
4. If all questions answered${showCalendarTimes ? ', SHOW THE CALENDAR TIMES LISTED ABOVE' : ', move to next step'}
5. Extract any new information from their response

${requiredQuestions.length > 0 ? `
EXTRACTION INSTRUCTIONS:
When you extract information, use these exact field names:
- Name/first name → "name"
- Email → "email"
- Phone → "phone"
- Income/household income → "householdIncome"
- Number of people/household members → "householdMembers"
- Zip code/location → "zipCode"
` : ''}

Return ONLY valid JSON (no markdown):
{
  "matchedResponseIndex": <0-${currentStep.responses.length - 1} or null for custom>,
  "customResponse": "<only if matchedResponseIndex is null>",
  "customDrips": [{"message": "follow-up message", "delayHours": 3}],
  "extractedInfo": {"fieldName": "value"},
  "reasoning": "<brief explanation>"
}`;

    const apiKey = process.env.OPENAI_API_KEY;

    // Build system message - emphasize not repeating questions
    const systemMessage = `You are a sales agent via SMS. CRITICAL: ${hasCollectedInfo ? 'Check the INFORMATION YOU ALREADY HAVE section - NEVER ask for anything listed there!' : 'Collect info naturally.'} Keep responses short. Return only valid JSON.`;

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

        // QUALITY CHECK: Validate and potentially fix the AI response
        const qualityCheck = validateAndFixResponse(agentResponse, {
          allQuestionsAnswered,
          requiredQuestions,
          collectedFieldsCount
        });

        if (qualityCheck.wasFixed) {
          console.log('✨ AI response improved by quality check');
          console.log('Issues found:', qualityCheck.issues);
          agentResponse = qualityCheck.response;
        }

        // Log quality metrics for monitoring
        logQualityMetrics(agentResponse, {
          allQuestionsAnswered,
          requiredQuestions,
          collectedFieldsCount
        }, qualityCheck.wasFixed);

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
          agentResponse = `Great news! I found 126 different health insurance options in your state based on your information. To help you find the best option, I'd love to schedule a call to discuss these. I have availability at: ${timesList}. Which time works best for you?`;
        } else if (requiresCall && allQuestionsAnswered && !calendarTimesShown && calendarSlots.length > 0) {
          // All questions answered and times NOT shown yet - FORCE show times immediately
          console.log('🎯 TRIGGERING CALENDAR OVERRIDE - All questions answered, showing times now');
          const slotsToShow = calendarSlots.slice(0, 3);
          const timesList = slotsToShow.map(s => {
            const timeMatch = s.formatted.match(/at (.+)$/);
            return timeMatch ? timeMatch[1] : s.formatted;
          }).join(', ');
          agentResponse = `Great news! I found 126 different health insurance options in your state based on your information. To help you find the best option, I'd love to schedule a call to discuss these. I have availability at: ${timesList}. Which time works best for you?`;
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
            agentResponse = `Great news! I found 126 different health insurance options in your state based on your information. To help you find the best option, I'd love to schedule a call to discuss these. I have availability at: ${timesList}. Which time works best for you?`;
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
            agentResponse = `Great news! I found 126 different health insurance options in your state based on your information. To help you find the best option, I'd love to schedule a call to discuss these. I have availability at: ${timesList}. Which time works best for you?`;
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
            agentResponse = `Great news! I found 126 different health insurance options in your state based on your information. To help you find the best option, I'd love to schedule a call to discuss these. I have availability at: ${timesList}. Which time works best for you?`;
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

      // TEMPLATE FALLBACK: Use templated response if AI response is empty or problematic
      if (!agentResponse || agentResponse.trim().length === 0) {
        try {
          const templatedResponse = generateTemplatedResponse({
            allQuestionsAnswered,
            requiredQuestions,
            collectedFieldsCount,
            currentField: currentStep?.field,
            userName: collectedInfo.name
          });

          if (templatedResponse) {
            agentResponse = templatedResponse;
            console.log('📋 Using templated fallback response');
          }
        } catch (error) {
          console.error('Error generating templated response:', error);
        }
      }

      return NextResponse.json({
        agentResponse: stripMarkdownBold(agentResponse),
        nextStepIndex: nextStepIndex,
        reasoning: aiDecision.reasoning,
        matchedResponseIndex: aiDecision.matchedResponseIndex,
        shouldAdvanceToNextStep: shouldMoveToNextStep,
        isCustomResponse: aiDecision.matchedResponseIndex === null,
        customDrips: aiDecision.customDrips || [],
        extractedInfo: aiDecision.extractedInfo || {},
        availableSlots: calendarSlots,
        appointmentBooked: appointmentBooked,
        appointmentInfo: bookedAppointmentInfo,
        sessionId: currentSessionId,
        leadId: currentLeadId
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
