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

    const { userMessage, requiredQuestions, collectedInfo, requiresCall } = await req.json();

    console.log('📋 Simple flow - requiredQuestions:', requiredQuestions);
    console.log('📋 Simple flow - collectedInfo:', collectedInfo);
    console.log('📋 Simple flow - userMessage:', userMessage);

    // If user sent a message, try to match it to the current question we're waiting for
    if (userMessage && requiredQuestions && requiredQuestions.length > 0) {
      // Find the first unanswered question
      const unansweredQuestion = requiredQuestions.find((q: any) => !collectedInfo[q.fieldName]);

      if (unansweredQuestion) {
        // User is answering this question - save the answer
        const updatedInfo = {
          ...collectedInfo,
          [unansweredQuestion.fieldName]: userMessage
        };

        console.log('💾 Saved answer for', unansweredQuestion.fieldName, ':', userMessage);

        // Check if there are more questions after this one
        const nextQuestion = requiredQuestions.find((q: any) => !updatedInfo[q.fieldName]);

        if (nextQuestion) {
          // Ask the next question
          return NextResponse.json({
            agentResponse: nextQuestion.question,
            extractedInfo: updatedInfo,
            collectedInfo: updatedInfo,
            done: false
          });
        } else {
          // All questions answered, move to calendar
          console.log('✅ All questions answered, checking calendar...');
          // Continue to calendar logic below
          Object.assign(collectedInfo, updatedInfo);
        }
      }
    }

    // If this is the first message (no user message yet), ask the first question
    if (!userMessage && requiredQuestions && requiredQuestions.length > 0) {
      const firstQuestion = requiredQuestions[0];
      return NextResponse.json({
        agentResponse: firstQuestion.question,
        collectedInfo,
        done: false
      });
    }

    // All questions answered
    if (requiresCall) {
      // Fetch real calendar slots
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
        console.log('📅 Calendar data:', calendarData);

        if (calendarData.hasCalendar && calendarData.availableSlots && calendarData.availableSlots.length > 0) {
          // Show 3 real calendar times
          const slotsToShow = calendarData.availableSlots.slice(0, 3);
          const timesList = slotsToShow.map((s: any) => {
            const timeMatch = s.formatted.match(/at (.+)$/);
            return timeMatch ? timeMatch[1] : s.formatted;
          }).join(', ');

          return NextResponse.json({
            agentResponse: `Great! I have availability at: ${timesList}. Which time works best for you?`,
            extractedInfo: collectedInfo,
            availableSlots: slotsToShow,
            done: false,
            awaitingTimeSelection: true
          });
        } else {
          // No calendar slots available
          return NextResponse.json({
            agentResponse: `I apologize, but I'm unable to access my calendar at the moment. Please try again shortly.`,
            extractedInfo: collectedInfo,
            done: false
          });
        }
      } catch (error) {
        console.error('Calendar error:', error);
        return NextResponse.json({
          agentResponse: `I apologize, but I'm unable to access my calendar at the moment. Please try again shortly.`,
          extractedInfo: collectedInfo,
          done: false
        });
      }
    }

    // No call required, we're done
    return NextResponse.json({
      agentResponse: "Thank you! I have all the information I need. Someone will be in touch shortly.",
      extractedInfo: collectedInfo,
      done: true
    });

  } catch (error: any) {
    console.error("Error in simple flow:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
