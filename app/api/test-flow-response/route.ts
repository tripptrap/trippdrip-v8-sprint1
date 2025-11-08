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
    const prompt = `You are simulating a sales conversation flow. Based on the user's message, determine the best response.

Current Step Information:
- Agent's Message: "${currentStep.yourMessage}"
- Available Response Options:
${currentStep.responses.map((r: any, i: number) => `  ${i + 1}. ${r.label}: "${r.followUpMessage}"`).join('\n')}

Conversation History:
${conversationHistory || 'This is the start of the conversation'}

User's Latest Message:
"${userMessage}"

Your Task:
1. Analyze if the user's message indicates they're moving forward positively (in which case, move to the next step)
2. OR determine which response option best matches their message (objection, question, not interested, etc.)
3. Return the appropriate follow-up message

Return ONLY valid JSON (no markdown):
{
  "matchedResponseIndex": <number or null if moving forward>,
  "agentResponse": "<the exact response text to send>",
  "shouldAdvanceToNextStep": <true or false>,
  "reasoning": "<brief explanation of why this response was chosen>"
}

If the user is moving forward positively (like "yes", "I'm interested", "sure", "sounds good"), set shouldAdvanceToNextStep to true and use the next step's yourMessage as the agentResponse.
Otherwise, match their message to the most appropriate response option.`;

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

      if (aiDecision.shouldAdvanceToNextStep) {
        // Move to next step in sequence
        nextStepIndex = currentStepIndex + 1;

        // If there's a next step, use its message
        if (nextStepIndex < allSteps.length) {
          aiDecision.agentResponse = allSteps[nextStepIndex].yourMessage;
        } else {
          // End of flow
          aiDecision.agentResponse = "Thank you! We've reached the end of this conversation flow.";
          nextStepIndex = currentStepIndex; // Stay on current step
        }
      } else if (aiDecision.matchedResponseIndex !== null && aiDecision.matchedResponseIndex !== undefined) {
        // Use the matched response's follow-up message
        const matchedResponse = currentStep.responses[aiDecision.matchedResponseIndex];
        if (matchedResponse) {
          aiDecision.agentResponse = matchedResponse.followUpMessage;

          // Check if this response has a nextStepId to follow
          if (matchedResponse.nextStepId) {
            const targetStepIndex = allSteps.findIndex((s: any) => s.id === matchedResponse.nextStepId);
            if (targetStepIndex >= 0) {
              nextStepIndex = targetStepIndex;
            }
          }

          // Check if action is 'end'
          if (matchedResponse.action === 'end') {
            aiDecision.agentResponse += "\n\nThank you for your time. Have a great day!";
          }
        }
      }

      return NextResponse.json({
        agentResponse: aiDecision.agentResponse,
        nextStepIndex: nextStepIndex,
        reasoning: aiDecision.reasoning,
        matchedResponseIndex: aiDecision.matchedResponseIndex,
        shouldAdvanceToNextStep: aiDecision.shouldAdvanceToNextStep
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
