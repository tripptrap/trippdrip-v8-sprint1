import { NextResponse } from "next/server";
import { spendPointsForAction } from "@/lib/pointsSupabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    // Check and deduct points BEFORE making AI request (2 points for AI response)
    const pointsResult = await spendPointsForAction('ai_response', 1);

    if (!pointsResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: pointsResult.error || "Insufficient points. You need 2 points for AI responses.",
          pointsNeeded: 2
        },
        { status: 402 }
      );
    }

    const safeMessages = Array.isArray(messages) ? messages : [{ role: "user", content: "hello" }];
    const useModel = typeof model === "string" && model.length ? model : "gpt-4o-mini";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: useModel,
        messages: safeMessages
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: text || "OpenAI error" }, { status: 500 });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({
      ok: true,
      reply,
      pointsUsed: 2,
      remainingBalance: pointsResult.balance
    });
  } catch (error: any) {
    console.error('Error in /api/ai:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}
