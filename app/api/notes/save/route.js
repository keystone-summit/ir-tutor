// POST /api/notes/save
//   body: { course, week_number, content, audio_url?, transcript? }
//   -> { ok:true, note:{...} }
// PIN-gated. Inserts a new note row and returns it.
export const runtime = "nodejs";

import { requireAuth } from "../../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../../lib/db";
import { isCourse } from "../../../../lib/courses";

export async function POST(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request." }, { status: 400 }); }

  const course = body && body.course;
  const week = parseInt(body && body.week_number, 10);
  const content = body && body.content;
  const audioUrl = body && body.audio_url ? String(body.audio_url) : null;
  const transcript = body && body.transcript ? String(body.transcript) : null;

  if (!isCourse(course) || !Number.isInteger(week) || !content || !String(content).trim()) {
    return Response.json({ ok: false, error: "course, week_number, non-empty content required." }, { status: 400 });
  }
  try {
    const r = await query(
      `insert into public.notes (user_id, course, week_number, content, audio_url, transcript)
       values ($1, $2, $3, $4, $5, $6)
       returning id, course, week_number, content, audio_url, transcript, created_at, updated_at`,
      [JOHN_USER_ID, course, week, String(content), audioUrl, transcript]
    );
    return Response.json({ ok: true, note: r.rows[0] });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}
