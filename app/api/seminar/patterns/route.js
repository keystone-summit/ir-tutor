// GET /api/seminar/patterns            -> { ok, patterns:[...] } (all, with cross-ref)
// GET /api/seminar/patterns?id=<n>     -> { ok, pattern:{...} } (one, with cross-ref)
//   Phase 3b — the Library of Patterns data source. Each pattern carries a
//   `matched_editions` array: the published seminar editions whose events were
//   matched to it, newest first (powers the "matched in N current events"
//   cross-reference on the Library cards + detail view).
//   PIN-gated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

const SELECT = `
  select p.id, p.name, p.pattern_type, p.era, p.date_range, p.region, p.parties,
         p.description, p.what_happened, p.outcome, p.lessons,
         p.modern_relevance_keywords, p.created_at,
         coalesce(m.matched_editions, '[]'::json) as matched_editions
    from public.seminar_historical_patterns p
    left join lateral (
      select json_agg(json_build_object(
               'seminar_id',      ed.id,
               'edition_title',   ed.title,
               'week_start_date', ed.week_start_date,
               'event_title',     ev.title,
               'match_strength',  pm.match_strength,
               'explanation',     pm.explanation
             ) order by ed.week_start_date desc) as matched_editions
        from public.seminar_pattern_matches pm
        join public.seminar_events ev   on ev.id = pm.seminar_event_id
        join public.seminar_editions ed on ed.id = ev.seminar_id
       where pm.historical_pattern_id = p.id
         and ed.status = 'published'
    ) m on true
`;

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id"), 10);

  try {
    if (Number.isInteger(id)) {
      const r = await query(`${SELECT} where p.id = $1 limit 1`, [id]);
      return Response.json({ ok: true, pattern: r.rows[0] || null });
    }
    const r = await query(`${SELECT} order by p.name asc`, []);
    return Response.json({ ok: true, patterns: r.rows });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }
}
