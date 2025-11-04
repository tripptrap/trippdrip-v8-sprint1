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
        // Force a hard navigation to clear any cached content
        window.location.href = "/";
      } else {
        setError("Invalid password");
        setLoading(false);
      }
    } catch (err) {
      setError("An error occurred");
      setLoading(false);
    }
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Access Required</title>
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0b0f14', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{
              background: '#0d121a',
              border: '1px solid #1a2637',
              borderRadius: '12px',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
              <h1 style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#e7eef9',
                marginBottom: '0.5rem',
                textAlign: 'center',
                margin: '0 0 0.5rem 0'
              }}>
                🔒 Access Required
              </h1>
              <p style={{
                color: '#9fb0c3',
                fontSize: '0.875rem',
                marginBottom: '1.5rem',
                textAlign: 'center',
                margin: '0 0 1.5rem 0'
              }}>
                This site is password protected
              </p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    htmlFor="password"
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#9fb0c3',
                      marginBottom: '0.5rem'
                    }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: '#0c1420',
                      border: '1px solid #223246',
                      borderRadius: '8px',
                      color: '#e7eef9',
                      fontSize: '1rem',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                    placeholder="Enter password"
                    required
                    autoFocus
                    autoComplete="off"
                  />
                </div>

                {error && (
                  <div style={{
                    color: '#ff6b6b',
                    fontSize: '0.875rem',
                    textAlign: 'center',
                    background: 'rgba(255, 107, 107, 0.1)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: '8px',
                    padding: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !password}
                  style={{
                    width: '100%',
                    background: loading || !password ? '#1e3a8a' : '#2563eb',
                    color: 'white',
                    fontWeight: '500',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '1rem',
                    cursor: loading || !password ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s',
                    opacity: loading || !password ? 0.6 : 1
                  }}
                >
                  {loading ? "Checking..." : "Access Site"}
                </button>
              </form>

              <div style={{
                marginTop: '1.5rem',
                textAlign: 'center',
                fontSize: '0.75rem',
                color: '#5e7aa0'
              }}>
                Authorized Access Only
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
