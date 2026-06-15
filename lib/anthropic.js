// Thin server-side Anthropic wrapper, same call shape the tutor route uses.
// Keeps the API key server-only. No SDK dependency — plain fetch.
//
// Model default is claude-sonnet-4-6 (the seminar's analytical writing wants
// a capable model; the per-item summarise step is skipped for cost, so the
// only Claude calls per edition are: 1 selection + 1 deep-dive).

export async function claudeJSON({ system, user, model, maxTokens = 4096 }) {
  const out = await claudeText({ system, user, model, maxTokens });
  return extractJSON(out);
}

export async function claudeText({ system, user, model, maxTokens = 4096 }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Server is missing ANTHROPIC_API_KEY.");
  }
  const messages = Array.isArray(user)
    ? user
    : [{ role: "user", content: String(user) }];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || process.env.SEMINAR_MODEL || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Anthropic ${r.status}: ${detail.slice(0, 500)}`);
  }
  const data = await r.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Pull the first balanced JSON object/array out of a model response, even if
// it's wrapped in prose or a ```json fence.
export function extractJSON(text) {
  if (!text) throw new Error("Empty model response.");
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // find first { or [ and matching close
  const start = t.search(/[\[{]/);
  if (start === -1) throw new Error("No JSON found in model response.");
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end === -1) throw new Error("Unbalanced JSON in model response.");
  return JSON.parse(t.slice(start, end + 1));
}
