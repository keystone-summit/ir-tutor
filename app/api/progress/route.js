// /api/progress  — PIN-gated read/write of completed weeks.
//   GET                         -> { ok:true, weeks:[1,3,...] }
//   POST   { week, completed }  -> upsert (completed=true) or no-op
//   DELETE { week }             -> remove the week
export const runtime = "nodejs";

import { requireAuth } from "../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../lib/db";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const r = await query(
      "select week_number from public.progress where user_id = $1 order by week_number",
      [JOHN_USER_ID]
    );
    return Response.json({ ok: true, weeks: r.rows.map((x) => x.week_number) });
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
  if (!Number.isInteger(week)) return Response.json({ ok: false, error: "week required." }, { status: 400 });
  try {
    await query(
      `insert into public.progress (user_id, week_number, completed, updated_at)
       values ($1, $2, true, now())
       on conflict (user_id, week_number)
       do update set completed = true, updated_at = now()`,
      [JOHN_USER_ID, week]
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}

export async function DELETE(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request." }, { status: 400 }); }
  const week = parseInt(body && body.week, 10);
  if (!Number.isInteger(week)) return Response.json({ ok: false, error: "week required." }, { status: 400 });
  try {
    await query("delete from public.progress where user_id = $1 and week_number = $2", [JOHN_USER_ID, week]);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error." }, { status: 500 });
  }
}
