// POST /api/chat-saves/generate-summary
//   body: { course, week_number }   (week_number is the LOCAL week, 0-14)
//   -> { ok:true, summary, messages:[{role,content}, ...] }
//
// Pulls the tutor conversation from chat_messages for this user+course+week
// (mapping the local week to its band offset), asks Claude for a 4-6 bullet
// study summary, and returns both the summary and the raw messages so the
// client can save them as transcript_json.
export const runtime = "nodejs";

import { requireAuth } from "../../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../../lib/db";
import { isCourse, offsetWeek } from "../../../../lib/courses";

const SUMMARY_SYSTEM =
  "You are an academic study assistant. Read this tutoring conversation and " +
  "produce a 4-6 bullet study summary capturing the key concepts, terms " +
  "defined, and open questions. Format as plain bullets, one per line, " +
  "starting with '-'. Be concise but specific.";

export async function POST(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request." }, { status: 400 }); }

  const course = body && body.course;
  const week = parseInt(body && body.week_number, 10);
  if (!isCourse(course) || !Number.isInteger(week)) {
    return Response.json({ ok: false, error: "course and week_number required." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  let messages;
  try {
    const r = await query(
      `select role, content from public.chat_messages
        where user_id = $1 and week_number = $2
        order by created_at asc`,
      [JOHN_USER_ID, offsetWeek(course, week)]
    );
    messages = r.rows;
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }

  if (!messages.length) {
    return Response.json({ ok: false, error: "No conversation found for this module yet." }, { status: 400 });
  }

  // Render the conversation as a single text block for the summarizer.
  const transcriptText = messages
    .map((m) => `${m.role === "assistant" ? "Tutor" : "Student"}: ${m.content}`)
    .join("\n\n");

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.SUMMARY_MODEL || "claude-haiku-4-5",
        max_tokens: 1024,
        system: SUMMARY_SYSTEM,
        messages: [
          { role: "user", content: `Here is the tutoring conversation to summarize:\n\n${transcriptText}` },
        ],
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      return Response.json({ ok: false, error: "Summary service error.", detail }, { status: 502 });
    }
    const data = await resp.json();
    const summary = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return Response.json({ ok: true, summary, messages });
  } catch (e) {
    return Response.json({ ok: false, error: "Summary request failed." }, { status: 502 });
  }
}
