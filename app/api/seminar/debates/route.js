// GET /api/seminar/debates?seminar_id=<n>
//   PIN-gated. Returns the user's saved debate threads for an edition, newest
//   first. Response: { ok, debates:[{ id, persona, messages, created_at, updated_at }] }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../../lib/db";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const seminarId = parseInt(searchParams.get("seminar_id"), 10);
  if (!Number.isInteger(seminarId)) {
    return Response.json({ ok: false, error: "seminar_id required." }, { status: 400 });
  }
  try {
    const r = await query(
      `select id, persona, messages, created_at, updated_at
         from public.seminar_debates
        where user_id = $1 and seminar_id = $2
        order by updated_at desc`,
      [JOHN_USER_ID, seminarId]
    );
    return Response.json({ ok: true, debates: r.rows });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }
}
