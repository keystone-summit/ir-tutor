// GET /api/seminar/graph-data
//   GET /api/seminar/graph-data                 -> the full actor graph
//   GET /api/seminar/graph-data?seminar_id=<n>  -> edges first surfaced by one edition
//
//   PIN-gated (same posture as /api/seminar/current). Returns the node + edge
//   arrays the Phase 3a Live Actor Graph renders. Nodes are the actors that
//   participate in at least one relation; `type` is surfaced as entity_type so
//   the graph can colour by entity class. Edges carry weight (1-3), the
//   canonical relation_type, evidence and a source link for the edge popover.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const seminarId = parseInt(searchParams.get("seminar_id"), 10);
  const filterEdition = Number.isInteger(seminarId);

  try {
    const edgeRows = await query(
      `select r.id, r.from_actor_id, r.to_actor_id, r.relation_type, r.evidence,
              r.source_url, r.weight, r.first_seen_seminar_id
         from public.seminar_actor_relations r
        ${filterEdition ? "where r.first_seen_seminar_id = $1" : ""}
        order by r.weight desc, r.id asc`,
      filterEdition ? [seminarId] : []
    );

    const edges = edgeRows.rows.map((e) => ({
      id: e.id,
      source: e.from_actor_id,           // react-force-graph link source
      target: e.to_actor_id,             // react-force-graph link target
      relation_type: e.relation_type,
      evidence: e.evidence || "",
      source_url: e.source_url || "",
      weight: e.weight || 1,
      first_seen_seminar_id: e.first_seen_seminar_id,
    }));

    // Only return nodes that participate in the (possibly filtered) edge set.
    const ids = new Set();
    edges.forEach((e) => { ids.add(e.source); ids.add(e.target); });

    let nodes = [];
    if (ids.size) {
      const idList = Array.from(ids);
      const nodeRows = await query(
        `select a.id, a.name, a.type::text as entity_type, a.region,
                (select count(*) from public.seminar_actor_relations r
                  where r.from_actor_id = a.id or r.to_actor_id = a.id) as degree
           from public.seminar_actors a
          where a.id = any($1::bigint[])
          order by a.name asc`,
        [idList]
      );
      nodes = nodeRows.rows.map((n) => ({
        id: n.id,
        name: n.name,
        entity_type: n.entity_type || "org",
        region: n.region || null,
        degree: Number(n.degree) || 0,
      }));
    }

    // Facet vocabularies present in this graph (drive the sidebar checkboxes).
    const entityTypes = Array.from(new Set(nodes.map((n) => n.entity_type))).sort();
    const relationTypes = Array.from(new Set(edges.map((e) => e.relation_type))).sort();

    return Response.json({
      ok: true,
      seminar_id: filterEdition ? seminarId : null,
      counts: { nodes: nodes.length, edges: edges.length },
      entity_types: entityTypes,
      relation_types: relationTypes,
      nodes,
      edges,
    });
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }
}
