// GET  /api/chat-saves?course=            -> { ok:true, saves:[...] } (newest first)
// POST /api/chat-saves                      -> { ok:true, save:{...} }
//   body: { course, week_number, summary, title?, transcript_json }
// PIN-gated.
export const runtime = "nodejs";

import { requireAuth } from "../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../lib/db";
import { isCourse } from "../../../lib/courses";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const course = searchParams.get("course");
  if (!isCourse(course)) {
    return Response.json({ ok: false, error: "course required." }, { status: 400 });
  }
  try {
    const r = await query(
      `select id, course, week_number, summary, transcript_json, title, created_at, updated_at
         from public.chat_saves
        where user_id = $1 and course = $2
        order by week_number asc, created_at desc`,
      [JOHN_USER_ID, course]
    );
    return Response.json({ ok: true, saves: r.rows });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request." }, { status: 400 }); }

  const course = body && body.course;
  const week = parseInt(body && body.week_number, 10);
  const summary = body && body.summary;
  const title = body && body.title ? String(body.title) : null;
  const transcriptJson = body && body.transcript_json;

  if (!isCourse(course) || !Number.isInteger(week) || !summary || !String(summary).trim()) {
    return Response.json({ ok: false, error: "course, week_number, summary required." }, { status: 400 });
  }
  // transcript_json must be a JSON object (we store it as jsonb).
  if (transcriptJson == null || typeof transcriptJson !== "object") {
    return Response.json({ ok: false, error: "transcript_json (object) required." }, { status: 400 });
  }
  try {
    const r = await query(
      `insert into public.chat_saves (user_id, course, week_number, summary, transcript_json, title)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       returning id, course, week_number, summary, transcript_json, title, created_at, updated_at`,
      [JOHN_USER_ID, course, week, String(summary), JSON.stringify(transcriptJson), title]
    );
    return Response.json({ ok: true, save: r.rows[0] });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}
