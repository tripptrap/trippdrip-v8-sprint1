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

    const { userMessage, currentStep, allSteps, conversationHistory } = await req.json();

    if (!userMessage || !currentStep || !allSteps) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Build the AI prompt to determine the best response
    const prompt = `You are simulating a sales conversation flow. The agent just asked a question, and you need to determine how to respond based on the user's answer.

Current Step Information:
- Agent's Question: "${currentStep.yourMessage}"
- Available Response Categories (these are the different ways the user might respond):
${currentStep.responses.map((r: any, i: number) => `  ${i + 1}. ${r.label}`).join('\n')}

Conversation History:
${conversationHistory || 'This is the start of the conversation'}

User's Answer:
"${userMessage}"

IMPORTANT RULES:
1. ALWAYS match the user's message to one of the ${currentStep.responses.length} response categories above
2. The user is answering the agent's question "${currentStep.yourMessage}"
3. DO NOT advance to the next step - just pick which response category best matches
4. Return the index (0-based) of the matching category

Return ONLY valid JSON (no markdown):
{
  "matchedResponseIndex": <number 0 to ${currentStep.responses.length - 1}>,
  "reasoning": "<brief explanation>"
}

Example:
If agent asks "Are you currently looking for coverage?" and user says "yes I am", match to the response category that handles positive/interested responses.
If user says "no" or "maybe later", match to the not interested or need more info category.`;

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
          { role: "system", content: "You are an expert at analyzing conversation flows and matching user responses to appropriate follow-ups. Return only valid JSON, no markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
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

      // Get the matched response
      const matchedResponse = currentStep.responses[aiDecision.matchedResponseIndex];

      if (!matchedResponse) {
        return NextResponse.json({
          error: "Invalid response index"
        }, { status: 400 });
      }

      // Use the matched response's follow-up message
      agentResponse = matchedResponse.followUpMessage;

      // Check if this response has a nextStepId to follow
      if (matchedResponse.nextStepId) {
        const targetStepIndex = allSteps.findIndex((s: any) => s.id === matchedResponse.nextStepId);
        if (targetStepIndex >= 0) {
          nextStepIndex = targetStepIndex;
          shouldMoveToNextStep = true;
          // After showing the followUpMessage, move to the target step's message
          agentResponse += `\n\n${allSteps[targetStepIndex].yourMessage}`;
        }
      } else {
        // No nextStepId means we stay on current step and just show the followUp
        nextStepIndex = currentStepIndex;
      }

      // Check if action is 'end'
      if (matchedResponse.action === 'end') {
        agentResponse += "\n\nThank you for your time. Have a great day!";
      }

      return NextResponse.json({
        agentResponse: agentResponse,
        nextStepIndex: nextStepIndex,
        reasoning: aiDecision.reasoning,
        matchedResponseIndex: aiDecision.matchedResponseIndex,
        shouldAdvanceToNextStep: shouldMoveToNextStep
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
