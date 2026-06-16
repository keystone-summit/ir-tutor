// POST/GET /api/seminar/match-patterns
//   Phase 3b — the Historical Pattern Matcher engine.
//
//   For a published edition, reads its top-5 events and asks Claude to compare
//   each against the pre-seeded historical-pattern library, returning the top
//   2-3 patterns each event "rhymes with" (pattern_id + match_strength 1-10 +
//   a 2-3 sentence explanation). Matches are written to seminar_pattern_matches,
//   idempotent via the (event, pattern) unique index. The edition's existing
//   matches are cleared first so a re-run is a clean replace.
//
//   ONE Claude call per edition (all five events in a single prompt) keeps the
//   ?all=1 backfill inside the 60s Hobby cap.
//
//   Triggered three ways (mirrors extract-relationships):
//     1. Vercel Cron (Monday 13:00 UTC) — chains off /api/seminar/generate
//        (10:00 ingest -> 11:00 generate -> 12:00 extract -> 13:00 match).
//     2. Backfill — ?all=1 processes every published edition.
//     3. A specific edition — ?seminar_id=<n>.
//
//   Gated by SEMINAR_CRON_SECRET (cron / manual) OR a PIN token.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../lib/seminarAuth";
import { query } from "../../../../lib/db";
import { claudeJSON } from "../../../../lib/anthropic";

const MATCH_SYSTEM =
  "You are a foreign-policy historian running a 'historical pattern matcher'. " +
  "You are given this week's events and a numbered library of historical IR " +
  "inflection points. For each current event, you identify the 2-3 historical " +
  "patterns it most strongly RHYMES with — same strategic logic, not merely the " +
  "same region. Ground every match in the analysis; do not force weak matches. " +
  "Return STRICT JSON only, no prose outside JSON.";

function clampStrength(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, n));
}

async function listEditions(seminarId, all) {
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

// Compact, id-tagged library string for the prompt.
function libraryText(patterns) {
  return patterns
    .map((p) => {
      const kw = Array.isArray(p.modern_relevance_keywords)
        ? p.modern_relevance_keywords.slice(0, 8).join(", ")
        : "";
      const desc = String(p.description || "").replace(/\s+/g, " ").slice(0, 160);
      return `[${p.id}] ${p.name} (${p.pattern_type}${p.era ? " · " + p.era : ""}${p.region ? " · " + p.region : ""})` +
        `${kw ? " — keywords: " + kw : ""}${desc ? " — " + desc : ""}`;
    })
    .join("\n");
}

async function matchForEdition(edition, patterns, validIds, counters) {
  const ev = await query(
    `select id, rank, title, summary from public.seminar_events
      where seminar_id = $1 order by rank asc`,
    [edition.id]
  );
  const events = ev.rows || [];
  if (!events.length) {
    counters.skipped_editions += 1;
    return { edition_id: edition.id, matched: 0, skipped: "no events" };
  }

  const eventList = events
    .map((e) => `[${e.id}] (rank ${e.rank}) ${e.title}${e.summary ? " — " + e.summary : ""}`)
    .join("\n");

  let parsed;
  try {
    parsed = await claudeJSON({
      system: MATCH_SYSTEM,
      maxTokens: 4000,
      user:
        `THIS WEEK'S EVENTS (each tagged with its event_id):\n${eventList}\n\n` +
        `HISTORICAL PATTERN LIBRARY (each tagged with its pattern_id):\n${libraryText(patterns)}\n\n` +
        `For EACH event above, pick the 2-3 library patterns it most strongly rhymes with. ` +
        `Return STRICT JSON of this exact shape:\n` +
        `{"events":[{"event_id":<int from the list>,"matches":[` +
        `{"pattern_id":<int from the library>,"match_strength":<1-10, 10=near-identical strategic logic>,` +
        `"explanation":"<2-3 sentences: HOW this event rhymes with that pattern — the shared mechanism, and how it differs>"}` +
        `]}]}\n` +
        `Rules:\n` +
        `- Use ONLY event_ids and pattern_ids that appear above.\n` +
        `- 2-3 matches per event; omit an event only if NOTHING rhymes (rare).\n` +
        `- match_strength reflects how cleanly the strategic logic matches, not topical overlap.\n` +
        `- Output ONLY the JSON object, no commentary.`,
    });
  } catch (e) {
    counters.failed_editions += 1;
    return { edition_id: edition.id, matched: 0, error: String(e.message) };
  }

  // pg returns bigint columns as strings; normalise the id set to Numbers so
  // it compares cleanly against the parseInt'd ids Claude echoes back.
  const eventIds = new Set(events.map((e) => Number(e.id)));
  const rows = Array.isArray(parsed && parsed.events) ? parsed.events : [];

  // Flatten to (event_id, pattern_id) pairs, de-duped, validated, capped at 3/event.
  const wanted = new Map(); // "eid|pid" -> {eid,pid,strength,expl}
  const perEvent = new Map();
  for (const r of rows) {
    if (!r) continue;
    const eid = parseInt(r.event_id, 10);
    if (!eventIds.has(eid)) continue;
    const matches = Array.isArray(r.matches) ? r.matches : [];
    for (const m of matches) {
      if (!m) continue;
      const pid = parseInt(m.pattern_id, 10);
      if (!validIds.has(pid)) continue;
      const count = perEvent.get(eid) || 0;
      if (count >= 3) continue;
      const key = `${eid}|${pid}`;
      if (wanted.has(key)) continue;
      const expl = m.explanation ? String(m.explanation).slice(0, 1200) : "";
      if (!expl.trim()) continue;
      wanted.set(key, { eid, pid, strength: clampStrength(m.match_strength), expl });
      perEvent.set(eid, count + 1);
    }
  }

  // Clean replace: clear this edition's matches, then insert the fresh set.
  try {
    await query(
      `delete from public.seminar_pattern_matches
        where seminar_event_id in (select id from public.seminar_events where seminar_id = $1)`,
      [edition.id]
    );
  } catch (e) {
    counters.failed_editions += 1;
    return { edition_id: edition.id, matched: 0, error: "clear failed: " + String(e.message) };
  }

  let matched = 0;
  if (wanted.size) {
    const eids = [], pids = [], strengths = [], expls = [];
    for (const w of wanted.values()) { eids.push(w.eid); pids.push(w.pid); strengths.push(w.strength); expls.push(w.expl); }
    try {
      const up = await query(
        `insert into public.seminar_pattern_matches
           (seminar_event_id, historical_pattern_id, match_strength, explanation)
         select * from unnest($1::bigint[], $2::bigint[], $3::int[], $4::text[])
         on conflict (seminar_event_id, historical_pattern_id) do update
           set match_strength = excluded.match_strength,
               explanation    = excluded.explanation`,
        [eids, pids, strengths, expls]
      );
      matched = up.rowCount || eids.length;
    } catch (e) {
      counters.failed_editions += 1;
      return { edition_id: edition.id, matched: 0, error: "insert failed: " + String(e.message) };
    }
  }

  counters.processed_editions += 1;
  counters.total_matched += matched;
  return { edition_id: edition.id, title: edition.title, events: events.length, matched };
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

  // Load the library once for the whole invocation.
  let patterns;
  try {
    const r = await query(
      `select id, name, pattern_type, era, region, description, modern_relevance_keywords
         from public.seminar_historical_patterns order by id asc`,
      []
    );
    patterns = r.rows;
  } catch (e) {
    return Response.json({ ok: false, error: "Pattern library read failed.", detail: String(e.message) }, { status: 500 });
  }
  if (!patterns.length) {
    return Response.json({ ok: false, error: "Pattern library is empty — run /api/seminar/patterns/seed first." }, { status: 409 });
  }
  const validIds = new Set(patterns.map((p) => Number(p.id))); // bigint -> Number for .has() checks

  let editions;
  try {
    editions = await listEditions(seminarId, all);
  } catch (e) {
    return Response.json({ ok: false, error: "Edition lookup failed.", detail: String(e.message) }, { status: 500 });
  }
  if (!editions.length) {
    return Response.json({ ok: false, error: "No matching published edition found." }, { status: 404 });
  }

  const counters = { processed_editions: 0, skipped_editions: 0, failed_editions: 0, total_matched: 0 };
  const results = [];
  for (const ed of editions) {
    results.push(await matchForEdition(ed, patterns, validIds, counters));
  }

  let matchesTotal = 0;
  try {
    const c = await query(`select count(*)::int as n from public.seminar_pattern_matches`, []);
    matchesTotal = c.rows[0] ? c.rows[0].n : 0;
  } catch { /* best-effort */ }

  return Response.json({
    ok: true,
    library_size: patterns.length,
    editions_considered: editions.length,
    ...counters,
    matches_total: matchesTotal,
    results,
  });
}

export const GET = POST;
