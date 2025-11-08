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

    const { flowName, context } = await req.json();

    if (!flowName || !context || !context.whoYouAre || !context.whatOffering || !context.whoTexting) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check and deduct points BEFORE generating flow (15 points for flow creation)
    const FLOW_CREATION_COST = 15;

    // Get current balance
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (fetchError || !userData) {
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    const currentBalance = userData.credits || 0;

    if (currentBalance < FLOW_CREATION_COST) {
      return NextResponse.json({
        error: `Insufficient points. You need ${FLOW_CREATION_COST} points to generate a flow.`,
        pointsNeeded: FLOW_CREATION_COST
      }, { status: 402 });
    }

    // Deduct points
    const newBalance = currentBalance - FLOW_CREATION_COST;
    const { error: updateError } = await supabase
      .from('users')
      .update({ credits: newBalance, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating balance:', updateError);
      return NextResponse.json({ error: 'Failed to update balance' }, { status: 500 });
    }

    // Record transaction
    await supabase
      .from('points_transactions')
      .insert({
        user_id: user.id,
        action_type: 'spend',
        points_amount: -FLOW_CREATION_COST,
        description: 'Flow creation',
        created_at: new Date().toISOString()
      });

    // Generate the flow with OpenAI
    const prompt = `You are an expert at creating effective text message conversation flows for sales and lead generation.

Context:
- Who they are: ${context.whoYouAre}
- What they're offering: ${context.whatOffering}
- Who they're texting: ${context.whoTexting}
- Flow name: ${flowName}
- Qualifying questions: ${context.qualifyingQuestions}

Create a COMPREHENSIVE, professional conversation flow with 5-8 steps that covers the FULL sales journey from initial contact to close. Each step should have:
1. A message from the sender (keep it concise, friendly, and natural - like a real text)
2. Four possible response categories that a lead might give
3. For each response category, a follow-up message

The flow should progress through these stages:
- Step 1: Initial introduction and value proposition
- Step 2: Gauge interest and identify pain points
- Step 3-4: Ask qualifying questions (budget, timeline, needs)
- Step 5-6: Handle objections and provide social proof
- Step 7: Push for appointment/next step
- Step 8: Final close or follow-up scheduling

Make the conversation natural and casual (like real texting), avoid being too salesy or formal. The goal is to qualify leads and move them forward through the entire sales process.

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "steps": [
    {
      "id": "step-1",
      "yourMessage": "The initial message text here",
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
      "responses": [...]
    },
    {
      "id": "step-2b",
      "yourMessage": "Follow-up for neutral response path",
      "responses": [...]
    },
    {
      "id": "step-2c",
      "yourMessage": "Follow-up for objection handling path",
      "responses": [...]
    }
  ]
}

IMPORTANT BRANCHING RULES:
- Each response should have a "nextStepId" that points to which step comes next
- Use "action": "continue" to proceed to another step, or "action": "end" to end the conversation
- Create different paths (branches) for different types of responses
- Interested responses should lead to qualification steps
- Objections should lead to objection-handling steps
- Not interested should lead to soft close or end
- Use step IDs like "step-2a", "step-2b" to indicate branches from step 2

Important:
- Keep messages concise (1-3 sentences max)
- Use natural, conversational language
- Response labels should be 2-4 words max (e.g., "Interested", "Not interested", "Need more info", "Price question")
- Make sure each response category is distinct and covers common lead responses
- Include at least one "not interested" or negative response option`;

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

      return NextResponse.json({
        ...flowData,
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
