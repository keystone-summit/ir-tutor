// POST/GET /api/seminar/actors/seed
//   Phase 3.5 — one-shot loader that broadens the cui-bono actor graph beyond
//   the Iran-centric Week-1 set. Reads lib/seminar_actor_seed.json and:
//     (1) upserts each actor (name/type/region) into seminar_actors, and
//     (2) upserts curated relationship edges into seminar_actor_relations so
//         the new China / BRICS / Russia / Mexico-cartel / Venezuela actors
//         actually render as connected nodes in the Phase 3a Live Actor Graph
//         (the graph only returns actors that participate in an edge).
//   Idempotent: actors on lower(name), edges on (from,to,relation_type).
//
//   Gated by SEMINAR_CRON_SECRET (cron / manual) OR a PIN token.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../../lib/seminarAuth";
import { query } from "../../../../../lib/db";
import seed from "../../../../../lib/seminar_actor_seed.json";

const VALID_TYPES = ["state", "individual", "org", "ngo", "mnc", "armed_group", "institution"];
const VALID_RELS = ["allies", "opposes", "finances", "funded_by", "owns", "aligned_with", "employs", "family", "professional", "related_to"];

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const actors = Array.isArray(seed && seed.actors) ? seed.actors : [];
  const relations = Array.isArray(seed && seed.relations) ? seed.relations : [];
  if (!actors.length) {
    return Response.json({ ok: false, error: "Seed file has no actors." }, { status: 500 });
  }

  // 1) Upsert actors. Map name -> id for the edge pass.
  const idByName = new Map();
  let actorsInserted = 0, actorsUpdated = 0;
  for (const a of actors) {
    if (!a || !a.name) continue;
    const type = VALID_TYPES.includes(a.type) ? a.type : "org";
    try {
      const r = await query(
        `insert into public.seminar_actors (name, type, region)
         values ($1, $2::public.seminar_actor_type, $3)
         on conflict (lower(name)) do update set
           type = excluded.type, region = coalesce(excluded.region, public.seminar_actors.region), updated_at = now()
         returning id, (xmax = 0) as inserted`,
        [String(a.name).slice(0, 200), type, a.region ? String(a.region).slice(0, 80) : null]
      );
      idByName.set(a.name.toLowerCase(), r.rows[0].id);
      if (r.rows[0].inserted) actorsInserted += 1; else actorsUpdated += 1;
    } catch (e) {
      return Response.json({ ok: false, error: "Actor upsert failed.", detail: String(e.message), at: a.name }, { status: 500 });
    }
  }

  // 2) Upsert relationship edges (skip any whose endpoints didn't resolve).
  let edgesInserted = 0, edgesUpdated = 0, edgesSkipped = 0;
  for (const rel of relations) {
    if (!rel || !rel.from || !rel.to) { edgesSkipped += 1; continue; }
    const fromId = idByName.get(String(rel.from).toLowerCase());
    const toId = idByName.get(String(rel.to).toLowerCase());
    const relType = VALID_RELS.includes(rel.relation_type) ? rel.relation_type : "related_to";
    if (!fromId || !toId || fromId === toId) { edgesSkipped += 1; continue; }
    try {
      const r = await query(
        `insert into public.seminar_actor_relations
           (from_actor_id, to_actor_id, relation_type, evidence, weight)
         values ($1, $2, $3, $4, $5)
         on conflict (from_actor_id, to_actor_id, relation_type) do update set
           evidence = coalesce(excluded.evidence, public.seminar_actor_relations.evidence),
           updated_at = now()
         returning (xmax = 0) as inserted`,
        [fromId, toId, relType, rel.evidence ? String(rel.evidence).slice(0, 600) : null, rel.weight || 2]
      );
      if (r.rows[0].inserted) edgesInserted += 1; else edgesUpdated += 1;
    } catch (e) {
      return Response.json({ ok: false, error: "Edge upsert failed.", detail: String(e.message), at: `${rel.from}->${rel.to}` }, { status: 500 });
    }
  }

  let totals = { actors: 0, edges: 0 };
  try {
    const a = await query(`select count(*)::int as n from public.seminar_actors`, []);
    const e = await query(`select count(*)::int as n from public.seminar_actor_relations`, []);
    totals = { actors: a.rows[0] ? a.rows[0].n : 0, edges: e.rows[0] ? e.rows[0].n : 0 };
  } catch { /* best-effort */ }

  return Response.json({
    ok: true,
    actors: { considered: actors.length, inserted: actorsInserted, updated: actorsUpdated },
    edges: { considered: relations.length, inserted: edgesInserted, updated: edgesUpdated, skipped: edgesSkipped },
    totals,
  });
}

export const GET = POST;
