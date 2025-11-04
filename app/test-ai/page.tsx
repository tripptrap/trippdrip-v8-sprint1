"use client";
import React, { useState } from "react";
import { useAI } from "../../lib/useAI";

export default function TestAIPage() {
  const { loading, reply, ask } = useAI();
  const [input, setInput] = useState("");

  return (
    <div style={{ padding: 24 }}>
      <h1>AI Test</h1>
      <input
        value={input}
        onChange={(e)=>setInput(e.target.value)}
        placeholder="Ask something…"
        style={{ border: "1px solid #333", padding: 8, width: 300 }}
      />
      <button onClick={()=>ask(input)} disabled={loading} style={{ marginLeft: 8 }}>
        {loading ? "Thinking..." : "Send"}
      </button>
      <pre style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{reply}</pre>
    </div>
  );
}
