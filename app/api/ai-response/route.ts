import { NextRequest, NextResponse } from "next/server";
import { getModelConfig, buildSystemPrompt, AIModelVersion } from "@/lib/ai/models";

export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      leadName,
      leadInfo,
      flowContext,
      modelVersion = 'v1',  // Default to V1 for backwards compatibility
      customPrompt,         // Custom prompt for V2
      modelSettings         // Custom settings for V2 (temperature, etc.)
    } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Build conversation history for OpenAI
    const conversationHistory = messages.map((msg: any) => ({
      role: msg.direction === "in" ? "user" : "assistant",
      content: msg.body,
    }));

    // Get the last message from the lead to understand context
    const lastLeadMessage = messages.filter((m: any) => m.direction === "in").pop();
    const conversationLength = messages.length;

    // Build flow guidance if available
    let flowGuidance = "";
    if (flowContext && flowContext.steps && Array.isArray(flowContext.steps)) {
      flowGuidance = `\n\nConversation Flow Guidance:
Follow this flow as a general guide, adapting naturally to the conversation:

${flowContext.steps.map((step: any, index: number) => {
  let stepText = `Step ${index + 1}: ${step.yourMessage || ''}`;
  if (step.responses && Array.isArray(step.responses)) {
    stepText += '\n  Handle responses:';
    step.responses.forEach((resp: any) => {
      stepText += `\n  - ${resp.label || 'Response'}: ${resp.followUpMessage || ''}`;
    });
  }
  return stepText;
}).join('\n\n')}`;
    }

    // Determine conversation stage and tone
    const isNewConversation = conversationLength <= 2;
    const leadFirstName = leadName?.split(' ')[0] || '';

    // Get model configuration
    const modelConfig = getModelConfig(modelVersion as AIModelVersion);

    // Build the system prompt based on model version
    const systemPrompt = buildSystemPrompt(modelConfig, {
      leadName: leadName || 'Potential Client',
      leadFirstName: leadFirstName || 'there',
      leadLocation: leadInfo?.state || 'Unknown',
      leadStatus: leadInfo?.status || 'New lead',
      leadTags: leadInfo?.tags,
      flowGuidance,
      isNewConversation,
      customPrompt: modelVersion === 'v2' ? customPrompt : undefined
    });

    // Call OpenAI API directly using fetch
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OpenAI API key not configured");
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 }
      );
    }

    // Use model settings if provided (for V2), otherwise use defaults from config
    const temperature = modelSettings?.temperature ?? modelConfig.temperature;
    const maxTokens = modelSettings?.maxTokens ?? modelConfig.maxTokens;
    const presencePenalty = modelSettings?.presencePenalty ?? modelConfig.presencePenalty;
    const frequencyPenalty = modelSettings?.frequencyPenalty ?? modelConfig.frequencyPenalty;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ],
        temperature,
        max_tokens: maxTokens,
        presence_penalty: presencePenalty,
        frequency_penalty: frequencyPenalty,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenAI API error:", errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const completion = await response.json();
    let aiResponse = completion.choices[0]?.message?.content?.trim();

    if (!aiResponse) {
      return NextResponse.json(
        { error: "Failed to generate response" },
        { status: 500 }
      );
    }

    // Clean up the response - remove any quotation marks that GPT might add
    aiResponse = aiResponse.replace(/^["']|["']$/g, '').trim();

    // Ensure response isn't too long for SMS (160 chars ideal, 320 max)
    if (aiResponse.length > 320) {
      // Find a good break point
      const breakPoint = aiResponse.lastIndexOf('.', 300);
      if (breakPoint > 100) {
        aiResponse = aiResponse.substring(0, breakPoint + 1);
      } else {
        aiResponse = aiResponse.substring(0, 317) + '...';
      }
    }

    return NextResponse.json({
      response: aiResponse,
      pointsUsed: 1,
      modelVersion: modelVersion  // Return which model was used
    });
  } catch (error: any) {
    console.error("Error generating AI response:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate AI response. Please try again." },
      { status: 500 }
    );
  }
}
