// /api/chat  — PIN-gated read/write of tutor chat history.
//   GET  ?week=N                 -> { ok:true, messages:[{role,content},...] }
//   POST { week, role, content } -> append one message
export const runtime = "nodejs";

import { requireAuth } from "../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../lib/db";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const week = parseInt(searchParams.get("week"), 10);
  if (!Number.isInteger(week)) return Response.json({ ok: false, error: "week required." }, { status: 400 });
  try {
    const r = await query(
      `select role, content from public.chat_messages
       where user_id = $1 and week_number = $2
       order by created_at asc`,
      [JOHN_USER_ID, week]
    );
    return Response.json({ ok: true, messages: r.rows });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request." }, { status: 400 }); }
  const week = parseInt(body && body.week, 10);
  const role = body && body.role;
  const content = body && body.content;
  if (!Number.isInteger(week) || (role !== "user" && role !== "assistant") || !content) {
    return Response.json({ ok: false, error: "week, role(user|assistant), content required." }, { status: 400 });
  }
  try {
    await query(
      `insert into public.chat_messages (user_id, week_number, role, content)
       values ($1, $2, $3, $4)`,
      [JOHN_USER_ID, week, role, String(content)]
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}
