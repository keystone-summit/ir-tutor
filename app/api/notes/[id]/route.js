// PATCH  /api/notes/:id   body: { content }            -> { ok:true, note }
// DELETE /api/notes/:id                                 -> { ok:true }
// PIN-gated. Scoped to JOHN_USER_ID so a forged id can't touch another row.
export const runtime = "nodejs";

import { requireAuth } from "../../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../../lib/db";

function parseId(params) {
  const id = parseInt(params && params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req, { params }) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const id = parseId(params);
  if (!id) return Response.json({ ok: false, error: "Invalid id." }, { status: 400 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request." }, { status: 400 }); }
  const content = body && body.content;
  if (!content || !String(content).trim()) {
    return Response.json({ ok: false, error: "content required." }, { status: 400 });
  }
  try {
    const r = await query(
      `update public.notes set content = $1, updated_at = now()
        where id = $2 and user_id = $3
        returning id, course, week_number, content, audio_url, transcript, created_at, updated_at`,
      [String(content), id, JOHN_USER_ID]
    );
    if (!r.rows.length) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    return Response.json({ ok: true, note: r.rows[0] });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const id = parseId(params);
  if (!id) return Response.json({ ok: false, error: "Invalid id." }, { status: 400 });
  try {
    const r = await query(
      "delete from public.notes where id = $1 and user_id = $2 returning id",
      [id, JOHN_USER_ID]
    );
    if (!r.rows.length) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}
