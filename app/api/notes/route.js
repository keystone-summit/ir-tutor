// GET /api/notes?course=&week_number=   -> { ok:true, notes:[...] } (newest first)
// PIN-gated, same as /api/chat.
export const runtime = "nodejs";

import { requireAuth } from "../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../lib/db";
import { isCourse } from "../../../lib/courses";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const course = searchParams.get("course");
  const week = parseInt(searchParams.get("week_number"), 10);
  if (!isCourse(course) || !Number.isInteger(week)) {
    return Response.json({ ok: false, error: "course and week_number required." }, { status: 400 });
  }
  try {
    const r = await query(
      `select id, course, week_number, content, audio_url, transcript, created_at, updated_at
         from public.notes
        where user_id = $1 and course = $2 and week_number = $3
        order by created_at desc`,
      [JOHN_USER_ID, course, week]
    );
    return Response.json({ ok: true, notes: r.rows });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}
