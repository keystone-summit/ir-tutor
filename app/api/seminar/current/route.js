// GET /api/seminar/current            -> latest published edition (full)
// GET /api/seminar/current?id=<n>     -> a specific edition (full)
// PIN-gated. Returns { ok, edition, events[], deep_dive }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const idParam = parseInt(searchParams.get("id"), 10);

  try {
    let edition;
    if (Number.isInteger(idParam)) {
      const r = await query(
        `select id, week_start_date, week_end_date, title, status, published_at
           from public.seminar_editions where id = $1`,
        [idParam]
      );
      edition = r.rows[0];
    } else {
      const r = await query(
        `select id, week_start_date, week_end_date, title, status, published_at
           from public.seminar_editions
          where status = 'published'
          order by week_start_date desc
          limit 1`,
        []
      );
      edition = r.rows[0];
    }

    if (!edition) {
      return Response.json({ ok: true, edition: null, events: [], deep_dive: null });
    }

    const ev = await query(
      `select id, rank, title, summary, reasoning, source_url, source_name, source_region
         from public.seminar_events
        where seminar_id = $1
        order by rank asc`,
      [edition.id]
    );
    const dd = await query(
      `select event_id, layers, lenses, gaps, implications, what_to_watch
         from public.seminar_deep_dive
        where seminar_id = $1
        limit 1`,
      [edition.id]
    );

    return Response.json({
      ok: true,
      edition,
      events: ev.rows,
      deep_dive: dd.rows[0] || null,
    });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }
}
