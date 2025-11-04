"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        router.push("/");
        router.refresh();
      } else {
        setError("Invalid password");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-[#0d121a] border border-[#1a2637] rounded-xl p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-[#e7eef9] mb-2 text-center">
            TrippDrip v8
          </h1>
          <p className="text-[#9fb0c3] text-sm mb-6 text-center">
            Enter password to access
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#9fb0c3] mb-2"
              >
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#0c1420] border border-[#223246] rounded-lg text-[#e7eef9] placeholder-[#5e7aa0] focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-900/20 border border-red-900/50 rounded-lg py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
            >
              {loading ? "Checking..." : "Access Site"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-[#5e7aa0]">
            Protected Access Only
          </div>
        </div>
      </div>
    </div>
  );
}
