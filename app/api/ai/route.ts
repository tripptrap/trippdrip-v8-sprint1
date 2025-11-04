import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { messages, model, userPoints } = await req.json();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  // Check if user has enough points (1 point for AI chat)
  const pointCost = 1;
  const currentPoints = typeof userPoints === 'number' ? userPoints : 0;

  if (currentPoints < pointCost) {
    return NextResponse.json(
      {
        error: "Insufficient points. You need 1 point for AI chat. Please purchase more points.",
        pointsNeeded: pointCost,
        pointsAvailable: currentPoints
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
    return NextResponse.json({ error: text || "OpenAI error" }, { status: 500 });
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({
    ok: true,
    reply,
    pointsUsed: 1  // Return points used so client can deduct
  });
}
