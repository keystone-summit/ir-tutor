// POST/GET /api/seminar/patterns/seed
//   Phase 3b — one-shot loader for the historical-pattern library.
//   Reads lib/seminar_pattern_seed.json and upserts every entry into
//   seminar_historical_patterns, idempotent on lower(name) (re-running
//   refreshes content without creating duplicates). Safe to run repeatedly.
//
//   Per-row upserts: this is a ~50-row one-shot seed, not a hot path, and the
//   text[] columns (parties / keywords) don't survive a 2D-array unnest, so a
//   straightforward loop is both correct and fast enough.
//
//   Gated by SEMINAR_CRON_SECRET (cron / manual) OR a PIN token.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../../lib/seminarAuth";
import { query } from "../../../../../lib/db";
import seed from "../../../../../lib/seminar_pattern_seed.json";

function strArr(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean).slice(0, 40);
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const patterns = Array.isArray(seed && seed.patterns) ? seed.patterns : [];
  if (!patterns.length) {
    return Response.json({ ok: false, error: "Seed file has no patterns." }, { status: 500 });
  }

  let inserted = 0, updated = 0, skipped = 0;
  for (const p of patterns) {
    if (!p || !p.name || !p.pattern_type || !p.description) { skipped += 1; continue; }
    try {
      const r = await query(
        `insert into public.seminar_historical_patterns
           (name, pattern_type, era, date_range, region, parties, description,
            what_happened, outcome, lessons, modern_relevance_keywords)
         values ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10,$11::text[])
         on conflict (lower(name)) do update set
           pattern_type              = excluded.pattern_type,
           era                       = excluded.era,
           date_range                = excluded.date_range,
           region                    = excluded.region,
           parties                   = excluded.parties,
           description               = excluded.description,
           what_happened             = excluded.what_happened,
           outcome                   = excluded.outcome,
           lessons                   = excluded.lessons,
           modern_relevance_keywords = excluded.modern_relevance_keywords
         returning (xmax = 0) as inserted`,
        [
          String(p.name).slice(0, 200),
          String(p.pattern_type).slice(0, 60),
          p.era ? String(p.era).slice(0, 80) : null,
          p.date_range ? String(p.date_range).slice(0, 80) : null,
          p.region ? String(p.region).slice(0, 80) : null,
          strArr(p.parties),
          String(p.description),
          p.what_happened ? String(p.what_happened) : null,
          p.outcome ? String(p.outcome) : null,
          p.lessons ? String(p.lessons) : null,
          strArr(p.modern_relevance_keywords),
        ]
      );
      if (r.rows[0] && r.rows[0].inserted) inserted += 1; else updated += 1;
    } catch (e) {
      return Response.json(
        { ok: false, error: "Seed upsert failed.", detail: String(e.message), at: p.name },
        { status: 500 }
      );
    }
  }

  let total = 0;
  try {
    const c = await query(`select count(*)::int as n from public.seminar_historical_patterns`, []);
    total = c.rows[0] ? c.rows[0].n : 0;
  } catch { /* best-effort */ }

  return Response.json({ ok: true, considered: patterns.length, inserted, updated, skipped, total });
}

export const GET = POST;
