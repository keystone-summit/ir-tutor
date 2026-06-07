// Server-side only. The Anthropic API key lives here as an environment
// variable and is NEVER sent to the browser. PIN-gated so the Anthropic
// credits can't be burned by anonymous callers.
export const runtime = "nodejs";

import { requireAuth } from "../../../lib/auth";

export async function POST(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const { system, messages } = await req.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.TUTOR_MODEL || "claude-sonnet-4-6",
        max_tokens: 1024,
        system,
        messages,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return Response.json({ error: "Tutor service error.", detail }, { status: 502 });
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
}
