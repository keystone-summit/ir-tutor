// PATCH  /api/chat-saves/:id   body: { title?, summary? }   -> { ok:true, save }
// DELETE /api/chat-saves/:id                                 -> { ok:true }
// PIN-gated. Scoped to JOHN_USER_ID.
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

  const hasTitle = body && Object.prototype.hasOwnProperty.call(body, "title");
  const hasSummary = body && body.summary != null;
  if (!hasTitle && !hasSummary) {
    return Response.json({ ok: false, error: "title or summary required." }, { status: 400 });
  }
  const title = hasTitle ? (body.title ? String(body.title) : null) : undefined;
  const summary = hasSummary ? String(body.summary) : undefined;

  try {
    return await applyUpdate(id, title, summary);
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}

// Clean partial update: title can be set to null (cleared); summary cannot.
async function applyUpdate(id, title, summary) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
  if (summary !== undefined) { sets.push(`summary = $${i++}`); vals.push(summary); }
  sets.push("updated_at = now()");
  vals.push(id, JOHN_USER_ID);
  const r = await query(
    `update public.chat_saves set ${sets.join(", ")}
      where id = $${i++} and user_id = $${i++}
      returning id, course, week_number, summary, transcript_json, title, created_at, updated_at`,
    vals
  );
  if (!r.rows.length) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  return Response.json({ ok: true, save: r.rows[0] });
}

export async function DELETE(req, { params }) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const id = parseId(params);
  if (!id) return Response.json({ ok: false, error: "Invalid id." }, { status: 400 });
  try {
    const r = await query(
      "delete from public.chat_saves where id = $1 and user_id = $2 returning id",
      [id, JOHN_USER_ID]
    );
    if (!r.rows.length) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}
