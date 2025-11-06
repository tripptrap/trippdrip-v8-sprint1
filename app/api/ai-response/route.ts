import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { messages, leadName, leadInfo, userPoints, flowContext } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Check if user has enough points (2 points for AI response)
    const pointCost = 2;
    const currentPoints = typeof userPoints === 'number' ? userPoints : 0;

    if (currentPoints < pointCost) {
      return NextResponse.json(
        {
          error: "Insufficient points. You need 2 points to generate an AI response. Please purchase more points.",
          pointsNeeded: pointCost,
          pointsAvailable: currentPoints
        },
        { status: 402 }
      );
    }

    // Build conversation history for OpenAI
    const conversationHistory = messages.map((msg: any) => ({
      role: msg.direction === "in" ? "user" : "assistant",
      content: msg.body,
    }));

    // Build flow guidance if available
    let flowGuidance = "";
    if (flowContext && flowContext.steps && Array.isArray(flowContext.steps)) {
      flowGuidance = `\n\nConversation Flow Guidance:
You should follow this conversation flow as a general guide (not a strict script). Use it as the backbone to structure your conversation naturally:

${flowContext.steps.map((step: any, index: number) => {
  let stepText = `Step ${index + 1}: ${step.yourMessage || ''}`;
  if (step.responses && Array.isArray(step.responses)) {
    stepText += '\n  Expected response types and how to handle them:';
    step.responses.forEach((resp: any) => {
      stepText += `\n  - ${resp.label || 'Response'}: ${resp.followUpMessage || ''}`;
    });
  }
  return stepText;
}).join('\n\n')}

Use this flow as a guide to keep the conversation on track, but adapt naturally to what the lead is saying. Don't force the flow - let it guide you while staying conversational and responsive to their needs.`;
    }

    // Create system prompt with context
    const systemPrompt = `You are a helpful sales representative responding to a lead named ${leadName}.

Lead Information:
- Name: ${leadName}
- Phone: ${leadInfo?.phone || "Unknown"}
- Email: ${leadInfo?.email || "Unknown"}
- State: ${leadInfo?.state || "Unknown"}

Your goal is to be friendly, professional, and helpful. Keep responses concise and conversational (1-3 sentences typically).
Respond naturally to their most recent message based on the conversation history.${flowGuidance}`;

    // Call OpenAI API directly using fetch
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
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
    }

    const completion = await response.json();
    const aiResponse = completion.choices[0]?.message?.content?.trim();

    if (!aiResponse) {
      return NextResponse.json(
        { error: "Failed to generate response" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      response: aiResponse,
      pointsUsed: 2  // Return points used so client can deduct
    });
  } catch (error: any) {
    console.error("Error generating AI response:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
