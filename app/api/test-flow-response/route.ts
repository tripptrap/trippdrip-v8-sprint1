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
    const prompt = `You are a sales agent in a text message conversation. You need to respond naturally to the client's message while following your conversation flow.

CONVERSATION CONTEXT:
${conversationHistory || 'This is the start of the conversation'}

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
  "reasoning": "<1-2 sentences explaining your choice>"
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
          { role: "system", content: "You are a sales agent who reads conversations carefully and responds appropriately. Think about what the client is really saying and what makes sense to say next. Return only valid JSON, no markdown." },
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
        // Use AI's custom response, stay on current step
        agentResponse = aiDecision.customResponse;
        nextStepIndex = currentStepIndex;
      } else {
        // Get the matched response
        const matchedResponse = currentStep.responses[aiDecision.matchedResponseIndex];

        if (!matchedResponse) {
          return NextResponse.json({
            error: "Invalid response index"
          }, { status: 400 });
        }

        // Check if this response has a nextStepId to follow
        if (matchedResponse.nextStepId) {
          const targetStepIndex = allSteps.findIndex((s: any) => s.id === matchedResponse.nextStepId);
          if (targetStepIndex >= 0) {
            nextStepIndex = targetStepIndex;
            shouldMoveToNextStep = true;
            // If moving to next step, use that step's message (not the followUp)
            agentResponse = allSteps[targetStepIndex].yourMessage;
          } else {
            // Invalid nextStepId, use followUp instead
            agentResponse = matchedResponse.followUpMessage;
            nextStepIndex = currentStepIndex;
          }
        } else {
          // No nextStepId means we stay on current step and just show the followUp
          agentResponse = matchedResponse.followUpMessage;
          nextStepIndex = currentStepIndex;
        }

        // Note: We don't force-end conversations anymore. The AI can handle all responses naturally.
      }

      return NextResponse.json({
        agentResponse: agentResponse,
        nextStepIndex: nextStepIndex,
        reasoning: aiDecision.reasoning,
        matchedResponseIndex: aiDecision.matchedResponseIndex,
        shouldAdvanceToNextStep: shouldMoveToNextStep,
        isCustomResponse: aiDecision.matchedResponseIndex === null
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
