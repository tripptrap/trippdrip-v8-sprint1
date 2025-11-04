"use client";
import { useState } from "react";

export function useAI(model: string = "gpt-4o-mini") {
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");

  async function ask(prompt: string) {
    setLoading(true);
    setReply("");
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are TrippDrip AI for this dashboard." },
          { role: "user", content: prompt }
        ]
      })
    });
    const json = await res.json();
    if (json?.reply) setReply(json.reply);
    setLoading(false);
    return json;
  }

  return { loading, reply, ask };
}
