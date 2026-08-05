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

    const { flowName, context, requiredQuestions, requiresCall, autonomyMode } = await req.json();

    if (!flowName || !context || !context.whoYouAre || !context.whatOffering || !context.whoTexting) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const FLOW_CREATION_COST = 15;

    // ── Affordability check only. The charge itself happens after the flow row
    // exists — see the bottom of this route.
    //
    // This used to deduct here, before the OpenAI call. That charged for the
    // ATTEMPT, not the flow: a model error, an unparseable response, or a failed
    // insert all took 15 points and produced nothing, with no refund anywhere on
    // the path (the document-upload route refunds; this one never did).
    //
    // The read-modify-write it used was also a lost update. Two generations at
    // once both read the same balance and both wrote balance-15, so one of the
    // two charges silently disappeared.
    //
    // This check is advisory — it exists so nobody burns a model call they cannot
    // pay for. The authoritative check is inside deduct_credits, which will not
    // let the balance go negative.
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (fetchError || !userData) {
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    if ((userData.credits || 0) < FLOW_CREATION_COST) {
      return NextResponse.json({
        error: `Insufficient points. You need ${FLOW_CREATION_COST} points to create a flow.`,
        pointsNeeded: FLOW_CREATION_COST
      }, { status: 402 });
    }

    // Build required questions section for prompt
    const requiredQuestionsText = requiredQuestions && requiredQuestions.length > 0
      ? `\n\nREQUIRED QUESTIONS (MUST ASK ONE AT A TIME):\nYou MUST create dedicated steps to ask each of these questions individually:\n${requiredQuestions.map((q: any, i: number) => `${i + 1}. ${q.question} (save response as "${q.fieldName}")`).join('\n')}\n\nIMPORTANT: Each required question should be its own step in the flow. DO NOT combine multiple questions into one message.`
      : '';

    const requiresCallText = requiresCall
      ? '\n\nCALL REQUIREMENT:\nThis flow requires scheduling a phone call or Zoom meeting with the client.\n\nIMPORTANT: After collecting all required information, the next message should transition to scheduling by saying something like "Great! Let me check my calendar for available times." The system will automatically fetch real available time slots and show them to the client. Do NOT include specific times in your flow - the system handles that at runtime.'
      : '';

    // Generate the flow with OpenAI
    const prompt = `You are an expert at creating effective text message conversation flows for sales and lead generation.

Context:
- Who they are: ${context.whoYouAre}
- What they're offering: ${context.whatOffering}
- Who they're texting: ${context.whoTexting}
- Flow name: ${flowName}
- Qualifying questions: ${context.qualifyingQuestions}
- Agent name: ${context.agentName || 'your specialist'}
- Company name: ${context.companyName || '{businessName}'}
- Contact reason: ${context.contactReason || 'Following up on their inquiry'}${context.callbackNumber ? `\n- Callback number: ${context.callbackNumber}` : ''}${context.website ? `\n- Website: ${context.website}` : ''}${requiredQuestionsText}${requiresCallText}

AGENT IDENTITY: The AI should introduce itself as ${context.agentName || 'your specialist'} from ${context.companyName || '{businessName}'}. If the lead asks 'who is this?' or 'who are you?', respond with the agent identity. The reason for contact is: ${context.contactReason || 'Following up on their inquiry'}

Create a LINEAR conversation flow showing the OPTIMAL PATH where the client moves forward with the sale:

**CRITICAL: DRIP SEQUENCES**
Each step MUST include a "dripSequence" array with 2-3 follow-up messages if the client doesn't respond:
- First drip: 3-4 hours later
- Second drip: 24 hours after first drip
- Third drip (optional): 48 hours after second drip
These follow-ups will only be sent during business hours (9 AM - 6 PM, weekdays).

FLOW STRUCTURE (8-12 steps total):
- The main flow should assume the client is INTERESTED and progressing toward the sale
- Each step moves the client closer to closing (intro → interest → qualification → commitment → close)
- The "yourMessage" field should be the NEXT message in the optimal sales path
- Response options are there to handle ALTERNATE scenarios (objections, questions, pushback)

CRITICAL STRUCTURE:
1. Step 1: Initial outreach / introduction - MUST include agent identity (e.g. "Hi! This is {agentName} with {companyName}. {contactReason}")
2. Step 2: Gauge interest and qualify the lead
3. Steps 3-N: Ask each REQUIRED QUESTION as a separate step (ONE QUESTION PER STEP)
   - NEVER combine required questions into one message
   - Each required question gets its own dedicated step
   - Example: If there are 5 required questions, create 5 separate steps for them
4. After all required questions: Overcome objections, build value
5. If call required: Propose scheduling the call/meeting
6. Final steps: Confirm appointment/next steps, close

**CRITICAL RULE FOR REQUIRED QUESTIONS:**
If required questions are provided, you MUST create individual steps for EACH question.
Do NOT ask multiple required questions in the same message.
Each required question should be asked conversationally, ONE AT A TIME.

Each step should have:
1. A SHORT message from the sender (1-2 sentences max - keep it concise like real texting)
   - This message assumes the client said YES to the previous step
   - It moves the conversation forward toward the close
   - MUST be a complete thought that asks a question or makes a statement
2. 2-4 possible response categories for when they DON'T follow the optimal path
3. For each alternate response, a COMPLETE follow-up message that:
   - Directly addresses their response
   - ALWAYS includes the next question or action
   - NEVER just acknowledges without moving forward
   - Example: "Great! Let's get started. What's your household income?" NOT just "Great! Let's get started."

THINK OF IT LIKE THIS:
- "yourMessage" = What you send when they're moving forward (the happy path)
- "responses.followUpMessage" = What you say when they respond differently
  - CRITICAL: EVERY followUpMessage must END with a question or call to action
  - BAD: "Great! Let's get started with a few quick questions."
  - GOOD: "Great! Let's get started. What's your household income?"
  - BAD: "I understand."
  - GOOD: "I understand. To help you best, what's your current coverage situation?"

Make messages ultra-concise and conversational. Think: "Great! What's your budget?" not paragraphs.

**CRITICAL RULE: NO DEAD ENDS**
Every message (yourMessage AND followUpMessage) must either:
1. Ask a specific question, OR
2. Make a clear call to action (schedule a call, move forward, etc.)
NEVER send a message that just acknowledges without progressing the conversation.

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "steps": [
    {
      "id": "step-1",
      "yourMessage": "The initial message text here",
      "dripSequence": [
        {
          "message": "First follow-up if no response after 3-4 hours",
          "delayHours": 3
        },
        {
          "message": "Second follow-up if still no response after 24 more hours",
          "delayHours": 27
        },
        {
          "message": "Final follow-up after 48 more hours",
          "delayHours": 75
        }
      ],
      "responses": [
        {
          "label": "Short label for response type 1",
          "followUpMessage": "Your follow-up if they give this type of response",
          "nextStepId": "step-2a",
          "action": "continue"
        },
        {
          "label": "Short label for response type 2",
          "followUpMessage": "Your follow-up if they give this type of response",
          "nextStepId": "step-2b",
          "action": "continue"
        },
        {
          "label": "Short label for response type 3",
          "followUpMessage": "Your follow-up if they give this type of response",
          "nextStepId": "step-2c",
          "action": "continue"
        },
        {
          "label": "Short label for response type 4",
          "followUpMessage": "Your follow-up if they give this type of response",
          "nextStepId": null,
          "action": "end"
        }
      ]
    },
    {
      "id": "step-2a",
      "yourMessage": "Follow-up for positive response path",
      "dripSequence": [...],
      "responses": [...]
    },
    {
      "id": "step-2b",
      "yourMessage": "Follow-up for neutral response path",
      "dripSequence": [...],
      "responses": [...]
    },
    {
      "id": "step-2c",
      "yourMessage": "Follow-up for objection handling path",
      "dripSequence": [...],
      "responses": [...]
    }
  ]
}

IMPORTANT FLOW RULES:
- The main flow (step-1 → step-2 → step-3 → etc.) is the OPTIMAL PATH assuming positive responses
- "yourMessage" at each step assumes they said YES to move forward
- Each response option handles DEVIATIONS from the optimal path:
  - "Objection" responses can loop back to try again or move to objection handling
  - "Question" responses can provide info then return to main flow
  - "Not interested" responses lead to soft close or end
  - "Interested/Yes" responses can be included but should continue the main sequence

RESPONSE STRUCTURE:
- Use "nextStepId": "step-X" to point to the next step in sequence
- Use "action": "continue" to proceed, or "action": "end" to end conversation
- Most responses should eventually reconnect to the main flow or close
- Example: If at step-3 they object, response might go to step-3-objection, then back to step-4

Important:
- Keep messages concise (1-3 sentences max)
- Use natural, conversational language
- Response labels should be 2-4 words max (e.g., "Price question", "Not interested", "Need more info")
- The main step sequence (step-1, step-2, step-3...) should flow naturally from intro to close
- Responses handle the "what ifs" - what if they object, question, or hesitate`;

    // Use direct fetch to bypass any SDK caching
    const apiKey = process.env.OPENAI_API_KEY;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert sales conversation designer. Return only valid JSON, no markdown formatting." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 4000,
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
        { error: "Failed to generate flow" },
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
      const flowData = JSON.parse(cleanedResponse);

      // Add IDs to steps if missing
      if (flowData.steps) {
        flowData.steps = flowData.steps.map((step: any, index: number) => ({
          ...step,
          id: step.id || `step-${index + 1}`
        }));
      }

      // Save the flow to the database
      const { data: savedFlow, error: insertError } = await supabase
        .from('conversation_flows')
        .insert({
          user_id: user.id,
          name: flowName,
          context: { ...context, autonomyMode: autonomyMode || 'full_auto' },
          steps: flowData.steps,
          required_questions: requiredQuestions || [],
          requires_call: requiresCall || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error saving flow to database:", insertError);
        return NextResponse.json(
          { error: `Failed to save flow: ${insertError.message}` },
          { status: 500 }
        );
      }

      console.log("✅ Flow saved to database:", savedFlow.id);

      // ── Charge, now that a flow demonstrably exists ────────────────────────
      //
      // Everything that can fail has already failed by this point: the model
      // call, the JSON parse, and the insert. Reaching here means the user has a
      // flow, so this is the only place a charge is honest.
      //
      // deduct_credits rather than a read-modify-write on users.credits: it does
      // the decrement in one atomic UPDATE with `credits >= amount` in the WHERE,
      // so concurrent generations cannot lose an update or drive the balance
      // negative. It RAISEs on insufficient funds, which supabase-js surfaces as
      // { error } — it does not throw.
      const { data: newBalance, error: chargeError } = await supabase
        .rpc('deduct_credits', { user_id: user.id, amount: FLOW_CREATION_COST });

      if (chargeError) {
        // The balance moved between the affordability check and here. Undo the
        // flow rather than hand out a free one — and say so plainly, because a
        // flow appearing and then vanishing with no explanation is worse than
        // the error.
        console.error('Flow charge failed, removing the flow:', chargeError.message);
        const { error: rollbackError } = await supabase
          .from('conversation_flows')
          .delete()
          .eq('id', savedFlow.id)
          .eq('user_id', user.id);
        if (rollbackError) {
          console.error('Could not remove the uncharged flow:', rollbackError.message);
        }
        return NextResponse.json({
          error: `Insufficient points. You need ${FLOW_CREATION_COST} points to create a flow.`,
          pointsNeeded: FLOW_CREATION_COST
        }, { status: 402 });
      }

      // deduct_credits does not write a ledger row (#137), so the caller owns
      // the history. This insert was previously unchecked, which is how a charge
      // could land with no record of it — exactly the "where did my points go"
      // question this route could not answer.
      const { error: ledgerError } = await supabase
        .from('points_transactions')
        .insert({
          user_id: user.id,
          action_type: 'spend',
          points_amount: -FLOW_CREATION_COST,
          description: `Flow created: ${flowName}`,
          created_at: new Date().toISOString()
        });

      if (ledgerError) {
        // Not worth failing the request over — the flow exists and is paid for.
        // But an untracked charge is the bug that made this route suspect, so it
        // must be loud rather than swallowed.
        console.error('POINTS LEDGER WRITE FAILED for flow creation — charge is untracked:', ledgerError.message);
      }

      return NextResponse.json({
        ...flowData,
        flowId: savedFlow.id,
        pointsUsed: FLOW_CREATION_COST,
        remainingBalance: newBalance
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
    console.error("Error generating flow:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
