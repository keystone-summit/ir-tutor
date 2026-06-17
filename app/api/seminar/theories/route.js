// GET /api/seminar/theories            -> { ok, theories:[...] } (all, related resolved)
// GET /api/seminar/theories?slug=<s>   -> { ok, theory:{...} } (one, related resolved)
//   Phase 3.5 — the IR Theory Library data source. Each entry resolves its
//   related_slugs to lightweight {slug,name,school} link objects so the drawer
//   can render cross-links without a second fetch. The seminar reader loads the
//   full list once and builds the inline theory-tag lexicon from match_terms.
//   PIN-gated (same posture as /api/seminar/patterns).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

const SELECT = `
  select id, slug, name, school, sub_school, era, classic_thinker,
         definition, canonical_example, modern_echo,
         coalesce(related_slugs, '{}') as related_slugs,
         coalesce(match_terms, '{}')   as match_terms,
         created_at
    from public.seminar_theory_library
`;

// Resolve each theory's related_slugs to {slug,name,school} using an in-memory
// index of the full set (cheap — the library is ~75 rows).
function withRelated(rows) {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return rows.map((r) => ({
    ...r,
    related: (r.related_slugs || [])
      .map((s) => bySlug.get(s))
      .filter(Boolean)
      .map((t) => ({ slug: t.slug, name: t.name, school: t.school })),
  }));
}

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("slug") || "").trim();

  try {
    const all = await query(`${SELECT} order by name asc`, []);
    const resolved = withRelated(all.rows);
    if (slug) {
      const one = resolved.find((t) => t.slug.toLowerCase() === slug.toLowerCase()) || null;
      return Response.json({ ok: true, theory: one });
    }
    return Response.json({ ok: true, theories: resolved });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }
}
