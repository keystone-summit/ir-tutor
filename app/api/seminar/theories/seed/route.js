// POST/GET /api/seminar/theories/seed
//   Phase 3.5 — one-shot loader for the IR Theory Library. Reads
//   lib/seminar_theory_seed.json and upserts every entry into
//   seminar_theory_library, idempotent on lower(slug) (re-running refreshes
//   content without creating duplicates). Safe to run repeatedly.
//
//   Per-row upserts: this is a ~75-row one-shot seed, not a hot path, and the
//   text[] columns (related_slugs / match_terms) don't survive a 2D-array
//   unnest, so a straightforward loop is correct and fast enough.
//
//   Gated by SEMINAR_CRON_SECRET (cron / manual) OR a PIN token.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../../lib/seminarAuth";
import { query } from "../../../../../lib/db";
import seed from "../../../../../lib/seminar_theory_seed.json";

function strArr(v, max = 40) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean).slice(0, max);
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const theories = Array.isArray(seed && seed.theories) ? seed.theories : [];
  if (!theories.length) {
    return Response.json({ ok: false, error: "Seed file has no theories." }, { status: 500 });
  }

  let inserted = 0, updated = 0, skipped = 0;
  for (const t of theories) {
    if (!t || !t.slug || !t.name || !t.school || !t.definition) { skipped += 1; continue; }
    try {
      const r = await query(
        `insert into public.seminar_theory_library
           (slug, name, school, sub_school, era, classic_thinker, definition,
            canonical_example, modern_echo, related_slugs, match_terms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::text[])
         on conflict (lower(slug)) do update set
           name              = excluded.name,
           school            = excluded.school,
           sub_school        = excluded.sub_school,
           era               = excluded.era,
           classic_thinker   = excluded.classic_thinker,
           definition        = excluded.definition,
           canonical_example = excluded.canonical_example,
           modern_echo       = excluded.modern_echo,
           related_slugs     = excluded.related_slugs,
           match_terms       = excluded.match_terms,
           updated_at        = now()
         returning (xmax = 0) as inserted`,
        [
          String(t.slug).slice(0, 120),
          String(t.name).slice(0, 200),
          String(t.school).slice(0, 60),
          t.sub_school ? String(t.sub_school).slice(0, 80) : null,
          t.era ? String(t.era).slice(0, 40) : null,
          t.classic_thinker ? String(t.classic_thinker).slice(0, 300) : null,
          String(t.definition),
          t.canonical_example ? String(t.canonical_example) : null,
          t.modern_echo ? String(t.modern_echo) : null,
          strArr(t.related_slugs),
          strArr(t.match_terms),
        ]
      );
      if (r.rows[0] && r.rows[0].inserted) inserted += 1; else updated += 1;
    } catch (e) {
      return Response.json(
        { ok: false, error: "Seed upsert failed.", detail: String(e.message), at: t.slug },
        { status: 500 }
      );
    }
  }

  let total = 0;
  try {
    const c = await query(`select count(*)::int as n from public.seminar_theory_library`, []);
    total = c.rows[0] ? c.rows[0].n : 0;
  } catch { /* best-effort */ }

  return Response.json({ ok: true, considered: theories.length, inserted, updated, skipped, total });
}

export const GET = POST;
