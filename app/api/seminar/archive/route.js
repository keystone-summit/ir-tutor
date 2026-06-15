// GET /api/seminar/archive  -> list of editions (titles + dates), newest first.
// PIN-gated. Phase 1 archive page is a stub list; Phase 2 will render each.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const r = await query(
      `select e.id, e.week_start_date, e.week_end_date, e.title, e.status, e.published_at,
              (select count(*) from public.seminar_events ev where ev.seminar_id = e.id) as event_count
         from public.seminar_editions e
        where e.status in ('published','archived')
        order by e.week_start_date desc
        limit 200`,
      []
    );
    return Response.json({ ok: true, editions: r.rows });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }
}
