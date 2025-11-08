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

    const { stepPurpose, flowContext, previousStep, nextStep } = await req.json();

    if (!stepPurpose) {
      return NextResponse.json(
        { error: "Step purpose is required" },
        { status: 400 }
      );
    }

    // Check and deduct points BEFORE generating step (1 point for single step)
    const STEP_CREATION_COST = 1;

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

    if (currentBalance < STEP_CREATION_COST) {
      return NextResponse.json({
        error: `Insufficient points. You need ${STEP_CREATION_COST} point to generate a step.`,
        pointsNeeded: STEP_CREATION_COST
      }, { status: 402 });
    }

    // Deduct points
    const newBalance = currentBalance - STEP_CREATION_COST;
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
        points_amount: -STEP_CREATION_COST,
        description: 'Single step generation',
        created_at: new Date().toISOString()
      });

    // Generate the step with OpenAI
    const prompt = `You are an expert at creating effective text message conversation flows for sales.

Context:
${flowContext ? `- Business: ${flowContext.whoYouAre}
- Offering: ${flowContext.whatOffering}
- Target: ${flowContext.whoTexting}` : ''}

Previous Step:
${previousStep ? `"${previousStep.yourMessage}"` : 'This is the first step'}

Next Step:
${nextStep ? `"${nextStep.yourMessage}"` : 'This is the last step'}

Step Purpose:
${stepPurpose}

Create a SINGLE conversation step that:
1. Bridges between the previous and next step naturally
2. Addresses the purpose: "${stepPurpose}"
3. Assumes the client is moving forward (optimal path)
4. Includes 2-4 response options for handling deviations

The message should be:
- Ultra-concise (1-2 sentences max)
- Conversational and natural
- Focused on moving toward the sale

Response options should handle:
- Objections related to this topic
- Questions they might ask
- Hesitation or pushback
- "Not interested" scenario

Return ONLY valid JSON (no markdown):
{
  "yourMessage": "The message text here",
  "responses": [
    {
      "label": "Short label (2-4 words)",
      "followUpMessage": "Brief response handling this scenario"
    }
  ]
}`;

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
          { role: "system", content: "You are an expert sales conversation designer. Return only valid JSON, no markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
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
        { error: "Failed to generate step" },
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
      const stepData = JSON.parse(cleanedResponse);

      return NextResponse.json({
        ...stepData,
        pointsUsed: STEP_CREATION_COST,
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
    console.error("Error generating step:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
