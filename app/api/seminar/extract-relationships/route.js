// POST/GET /api/seminar/extract-relationships
//   Phase 3a — Live Actor Graph extraction.
//
//   Reads a published edition's Deep Dive (five layers + five lenses + gaps +
//   implications) and its named-party catalogue, then asks Claude to surface
//   every relationship between two named entities. Each relation is upserted
//   into seminar_actor_relations, idempotent via the (from,to,relation_type)
//   unique index, and stamped with the edition that FIRST surfaced it.
//
//   Triggered three ways:
//     1. Vercel Cron (Monday 12:00 UTC) — chains off /api/seminar/generate
//        (10:00 ingest -> 11:00 generate -> 12:00 extract). No params: it
//        processes the latest published edition.
//     2. Backfill — ?all=1 processes every published edition (one-shot seed
//        of the existing Week-1 "Islamabad Declaration" edition).
//     3. A specific edition — ?seminar_id=<n>.
//
//   Runtime budget: this is a Hobby serverless function (60s hard cap). The
//   Claude call is kept compact (<=28 edges, short evidence) and ALL database
//   work is batched — one bulk actor-resolve + one bulk relation upsert per
//   edition — so a rich week finishes well inside the cap.
//
//   Gated by SEMINAR_CRON_SECRET (cron / manual) OR a PIN token.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../lib/seminarAuth";
import { query } from "../../../../lib/db";
import { claudeJSON } from "../../../../lib/anthropic";

// Canonical relation vocabulary (matches the graph legend + the migration comment).
const CANON_RELATIONS = new Set([
  "allies", "opposes", "finances", "funded_by", "owns",
  "aligned_with", "employs", "family", "professional", "related_to",
]);

const ACTOR_TYPES = ["state", "individual", "org", "ngo", "mnc", "armed_group", "institution"];

const EXTRACT_SYSTEM =
  "You are a foreign-policy intelligence analyst building a relationship graph " +
  "of the named entities in a weekly seminar. You identify how entities relate: " +
  "who allies with, opposes, finances, is funded by, owns, is aligned with, " +
  "employs, is family of, has a professional tie to, or is otherwise related to " +
  "whom. Ground every edge in the provided analysis — do not invent ties that " +
  "aren't supported by the text. Return STRICT JSON only, no prose outside JSON.";

function normRelation(v) {
  let s = String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const map = {
    ally: "allies", allied: "allies", alliance: "allies", supports: "allies",
    oppose: "opposes", opposed: "opposes", rival: "opposes", rivals: "opposes",
    against: "opposes", enemy: "opposes", enemies: "opposes", adversary: "opposes",
    finance: "finances", funds: "finances", financing: "finances",
    funds_by: "funded_by", funded: "funded_by", backed_by: "funded_by",
    own: "owns", owned: "owns", controls: "owns", subsidiary_of: "owns",
    aligned: "aligned_with", aligns_with: "aligned_with", partner: "aligned_with", partners: "aligned_with",
    employ: "employs", employed_by: "employs", works_for: "employs",
    relative: "family", related: "related_to", connected: "related_to",
  };
  if (map[s]) s = map[s];
  return CANON_RELATIONS.has(s) ? s : "related_to";
}

function clampWeight(w) {
  const n = parseInt(w, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(1, n));
}

async function listPublishedEditions(seminarId, all) {
  if (Number.isInteger(seminarId)) {
    const r = await query(
      `select id, title, week_start_date from public.seminar_editions where id = $1 limit 1`,
      [seminarId]
    );
    return r.rows;
  }
  if (all) {
    const r = await query(
      `select id, title, week_start_date from public.seminar_editions
        where status = 'published' order by week_start_date asc`,
      []
    );
    return r.rows;
  }
  const r = await query(
    `select id, title, week_start_date from public.seminar_editions
      where status = 'published' order by week_start_date desc limit 1`,
    []
  );
  return r.rows;
}

// Build the analysis blob + party catalogue for one edition.
async function loadEditionContext(editionId) {
  const ev = await query(
    `select rank, title, summary, source_url from public.seminar_events
      where seminar_id = $1 order by rank asc`,
    [editionId]
  );
  const dd = await query(
    `select layers, lenses, gaps, implications from public.seminar_deep_dive
      where seminar_id = $1 limit 1`,
    [editionId]
  );
  const deep = dd.rows[0] || {};
  const layers = deep.layers || {};
  const lenses = deep.lenses || {};
  const gaps = deep.gaps || {};
  const implications = deep.implications || {};
  const parties = Array.isArray(layers._parties) ? layers._parties : [];

  const events = ev.rows || [];
  const defaultSource = (events[0] && events[0].source_url) || null;

  const sections = [];
  sections.push(
    "TOP EVENTS:\n" +
      events.map((e) => `${e.rank}. ${e.title}${e.summary ? " — " + e.summary : ""}`).join("\n")
  );
  const layerText = ["world_order", "regional", "bilateral", "domestic", "actor"]
    .map((k) => (layers[k] ? `[${k}] ${layers[k]}` : "")).filter(Boolean).join("\n");
  if (layerText) sections.push("FIVE-LAYER DRILL-DOWN:\n" + layerText);
  const lensText = ["realism", "liberalism", "constructivism", "marxist", "game_theory"]
    .map((k) => (lenses[k] ? `[${k}] ${lenses[k]}` : "")).filter(Boolean).join("\n");
  if (lensText) sections.push("FIVE-LENS ANALYSIS:\n" + lensText);
  const impText = ["us_strategy", "us_business", "us_households"]
    .map((k) => (implications[k] ? `[${k}] ${implications[k]}` : "")).filter(Boolean).join("\n");
  if (impText) sections.push("IMPLICATIONS:\n" + impText);
  const gapText = Object.values(gaps || {}).filter(Boolean).join("\n");
  if (gapText) sections.push("GAPS:\n" + gapText);

  return { content: sections.join("\n\n"), parties, defaultSource, eventCount: events.length };
}

// Bulk-resolve a list of {name,type} to actor ids. One insert (missing names)
// + one select. Returns Map(lower(name) -> id).
async function bulkResolveActors(entries) {
  const byKey = new Map();           // lower(name) -> { name, type }
  for (const e of entries) {
    const name = String(e.name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { name: name.slice(0, 200), type: ACTOR_TYPES.includes(e.type) ? e.type : "org" });
  }
  const map = new Map();
  if (!byKey.size) return map;

  const names = [], types = [];
  for (const v of byKey.values()) { names.push(v.name); types.push(v.type); }

  // Insert any missing actors in one shot (existing names are left untouched).
  try {
    await query(
      `insert into public.seminar_actors (name, type)
       select n, t::public.seminar_actor_type
         from unnest($1::text[], $2::text[]) as u(n, t)
       on conflict (lower(name)) do nothing`,
      [names, types]
    );
  } catch { /* fall through to select; partial failures are non-fatal */ }

  // Map every requested name to its id.
  try {
    const r = await query(
      `select id, lower(name) as key from public.seminar_actors
        where lower(name) = any($1::text[])`,
      [Array.from(byKey.keys())]
    );
    r.rows.forEach((row) => map.set(row.key, row.id));
  } catch { /* leave unmapped names out */ }

  return map;
}

async function extractForEdition(edition, counters) {
  const { content, parties, defaultSource } = await loadEditionContext(edition.id);
  if (!content || content.length < 50) {
    counters.skipped_editions += 1;
    return { edition_id: edition.id, upserted: 0, total_returned: 0, skipped: "no deep-dive content" };
  }

  const partyList = parties.filter((p) => p && p.name)
    .map((p) => `- ${p.name} (${p.type || "org"})`).join("\n");

  let parsed;
  try {
    parsed = await claudeJSON({
      system: EXTRACT_SYSTEM,
      maxTokens: 5000,
      user:
        `Below is this week's seminar analysis plus its catalogue of named entities. ` +
        `Identify the most important relationships between two named entities that the analysis supports.\n\n` +
        `KNOWN ENTITIES (prefer these exact names; add new ones only if clearly named in the text):\n` +
        `${partyList || "(none catalogued — extract entities directly from the text)"}\n\n` +
        `ANALYSIS:\n${content.slice(0, 13000)}\n\n` +
        `Return STRICT JSON of this exact shape:\n` +
        `{"relationships":[{` +
        `"from_actor":"<entity name>",` +
        `"to_actor":"<entity name>",` +
        `"from_type":"state|individual|org|ngo|mnc|armed_group|institution",` +
        `"to_type":"state|individual|org|ngo|mnc|armed_group|institution",` +
        `"relation_type":"allies|opposes|finances|funded_by|owns|aligned_with|employs|family|professional|related_to",` +
        `"evidence":"<<=12 word phrase grounding the tie>",` +
        `"weight":<1-3 — 1 incidental, 2 notable, 3 central/structural>` +
        `}]}\n` +
        `Rules:\n` +
        `- Return 15-28 edges. Cover allies AND adversaries. Output ONLY the JSON object — no commentary, no trailing text.\n` +
        `- relation_type MUST be one of the ten canonical values.\n` +
        `- from_actor and to_actor must be two DIFFERENT entities.\n` +
        `- Keep "evidence" to a short phrase (<=12 words).\n` +
        `- Pick ONE direction per pair (financier -> "finances" -> recipient; don't also emit "funded_by" the other way).`,
    });
  } catch (e) {
    counters.failed_editions += 1;
    return { edition_id: edition.id, upserted: 0, total_returned: 0, error: String(e.message) };
  }

  const rels = Array.isArray(parsed && parsed.relationships) ? parsed.relationships : [];
  const typeByName = new Map();
  for (const p of parties) if (p && p.name) typeByName.set(String(p.name).trim().toLowerCase(), p.type);

  // Normalise + de-dupe edges within this batch (last write wins on a key).
  const wanted = new Map();          // "fromKey|toKey|rel" -> edge
  const nameTypes = [];
  for (const r of rels) {
    if (!r) continue;
    const fromName = String(r.from_actor || "").trim();
    const toName = String(r.to_actor || "").trim();
    if (!fromName || !toName || fromName.toLowerCase() === toName.toLowerCase()) continue;

    const fromType = r.from_type || typeByName.get(fromName.toLowerCase());
    const toType = r.to_type || typeByName.get(toName.toLowerCase());
    nameTypes.push({ name: fromName, type: fromType });
    nameTypes.push({ name: toName, type: toType });

    const relType = normRelation(r.relation_type);
    const key = `${fromName.toLowerCase()}|${toName.toLowerCase()}|${relType}`;
    wanted.set(key, {
      fromName, toName, relType,
      weight: clampWeight(r.weight),
      evidence: r.evidence ? String(r.evidence).slice(0, 600) : null,
      sourceUrl: r.source_url && /^https?:\/\//i.test(r.source_url) ? String(r.source_url).slice(0, 1000) : defaultSource,
    });
  }

  if (!wanted.size) {
    counters.processed_editions += 1;
    return { edition_id: edition.id, upserted: 0, inserted: 0, total_returned: rels.length };
  }

  // One bulk actor-resolve, then build the upsert arrays.
  const idByName = await bulkResolveActors(nameTypes);
  const fromIds = [], toIds = [], relTypes = [], evidences = [], sourceUrls = [], weights = [], firstSeen = [];
  for (const e of wanted.values()) {
    const fid = idByName.get(e.fromName.toLowerCase());
    const tid = idByName.get(e.toName.toLowerCase());
    if (!fid || !tid || fid === tid) continue;
    fromIds.push(fid); toIds.push(tid); relTypes.push(e.relType);
    evidences.push(e.evidence); sourceUrls.push(e.sourceUrl); weights.push(e.weight);
    firstSeen.push(edition.id);
  }

  let upserted = 0, inserted = 0;
  if (fromIds.length) {
    try {
      const up = await query(
        `insert into public.seminar_actor_relations
           (from_actor_id, to_actor_id, relation_type, evidence, source_url, weight, first_seen_seminar_id)
         select * from unnest(
           $1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::int[], $7::bigint[]
         )
         on conflict (from_actor_id, to_actor_id, relation_type) do update
           set evidence              = coalesce(excluded.evidence, public.seminar_actor_relations.evidence),
               source_url            = coalesce(excluded.source_url, public.seminar_actor_relations.source_url),
               weight                = greatest(public.seminar_actor_relations.weight, excluded.weight),
               first_seen_seminar_id = coalesce(public.seminar_actor_relations.first_seen_seminar_id, excluded.first_seen_seminar_id),
               updated_at            = now()
         returning (xmax = 0) as inserted`,
        [fromIds, toIds, relTypes, evidences, sourceUrls, weights, firstSeen]
      );
      upserted = up.rowCount || up.rows.length;
      inserted = up.rows.filter((r) => r.inserted).length;
    } catch (e) {
      counters.failed_editions += 1;
      return { edition_id: edition.id, upserted: 0, total_returned: rels.length, error: String(e.message) };
    }
  }

  counters.processed_editions += 1;
  counters.total_upserted += upserted;
  counters.total_inserted += inserted;
  return { edition_id: edition.id, title: edition.title, upserted, inserted, total_returned: rels.length };
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const seminarId = parseInt(searchParams.get("seminar_id"), 10);
  const all = searchParams.get("all") === "1" || searchParams.get("all") === "true";

  let editions;
  try {
    editions = await listPublishedEditions(seminarId, all);
  } catch (e) {
    return Response.json({ ok: false, error: "Edition lookup failed.", detail: String(e.message) }, { status: 500 });
  }
  if (!editions.length) {
    return Response.json({ ok: false, error: "No matching published edition found." }, { status: 404 });
  }

  const counters = {
    processed_editions: 0, skipped_editions: 0, failed_editions: 0,
    total_upserted: 0, total_inserted: 0,
  };
  const results = [];
  for (const ed of editions) {
    results.push(await extractForEdition(ed, counters));
  }

  let relationsTotal = 0;
  try {
    const c = await query(`select count(*)::int as n from public.seminar_actor_relations`, []);
    relationsTotal = c.rows[0] ? c.rows[0].n : 0;
  } catch { /* best-effort */ }

  return Response.json({
    ok: true,
    editions_considered: editions.length,
    ...counters,
    relations_total: relationsTotal,
    results,
  });
}

export const GET = POST;
