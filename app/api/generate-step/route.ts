import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

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

    // The charge itself happens after the step exists — see the bottom of this
    // route. The check above is advisory: it stops someone burning a model call
    // they cannot pay for, but deduct_credits is the authority on the balance.

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

      // Charge now that a step actually exists (#137).
      //
      // This used to deduct before the model call, with a read-then-write on
      // users.credits and a separate ledger insert. Three faults in one block:
      // an unparseable response or a model error still took the point with no
      // refund; two concurrent generations both read the same balance and both
      // wrote balance-1, losing a charge; and the session client cannot write
      // credits at all (column grants), so the update was silently refused and
      // the route reported a spend that never happened.
      //
      // deduct_credits is atomic, is granted to service_role only, and writes
      // the points_transactions row itself — so no insert here, or the step
      // would be counted twice.
      const { data: newBalance, error: chargeError } = await createServiceRoleClient()
        .rpc('deduct_credits', {
          user_id: user.id,
          amount: STEP_CREATION_COST,
          reason: 'Single step generation',
        });

      if (chargeError) {
        console.error('Step generated but could not charge for it:', chargeError);
        return NextResponse.json({
          error: `Insufficient points. You need ${STEP_CREATION_COST} point to generate a step.`,
          pointsNeeded: STEP_CREATION_COST,
        }, { status: 402 });
      }

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
