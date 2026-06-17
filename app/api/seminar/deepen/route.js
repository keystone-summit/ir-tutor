// POST/GET /api/seminar/deepen?seminar_id=<n>
//   Phase 3.5 — the marquee Deep Dive, split out of /api/seminar/generate so
//   each request makes at most ONE Claude call and stays under the 60s Hobby
//   function cap (two sequential Claude calls in generate was timing out).
//
//   Reads a published edition's events (rank-1 = the lead), asks Claude for the
//   five-layer drill-down + five-lens analysis + gaps + implications + watch +
//   named parties, writes seminar_deep_dive, and catalogues the named actors
//   (idempotent) for the Phase 2 click-in cards.
//
//   Triggered three ways:
//     1. Vercel Cron (Monday 11:30 UTC) — between generate (11:00) and
//        extract-relationships (12:00).
//     2. Fire-and-forget from /api/seminar/generate (manual runs).
//     3. A specific edition — ?seminar_id=<n> (defaults to latest published
//        edition that has no deep dive yet).
//
//   Gated by SEMINAR_CRON_SECRET (cron / manual) OR a PIN token. Idempotent.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../lib/seminarAuth";
import { query } from "../../../../lib/db";
import { claudeJSON } from "../../../../lib/anthropic";

const DEEP_SYSTEM =
  "You are a senior foreign-policy analyst and IR theorist writing the marquee " +
  "Deep Dive of a weekly US foreign-policy seminar. Write with analytical rigor, " +
  "name specific actors, and stay grounded in the provided reporting. Each prose " +
  "field should be 2-4 tight sentences. Return STRICT JSON only, no prose outside JSON.";

async function pickEdition(seminarId) {
  if (Number.isInteger(seminarId)) {
    const r = await query(
      `select id, title from public.seminar_editions where id = $1 limit 1`, [seminarId]);
    return r.rows[0] || null;
  }
  // Latest published edition lacking a deep dive; else just the latest published.
  const r = await query(
    `select e.id, e.title
       from public.seminar_editions e
       left join public.seminar_deep_dive d on d.seminar_id = e.id
      where e.status = 'published'
      order by (d.id is not null), e.week_start_date desc
      limit 1`, []);
  return r.rows[0] || null;
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const seminarId = parseInt(searchParams.get("seminar_id"), 10);

  const edition = await pickEdition(seminarId);
  if (!edition) return Response.json({ ok: false, error: "No edition to deepen." }, { status: 404 });

  const ev = await query(
    `select id, rank, title, summary, reasoning, raw_html
       from public.seminar_events where seminar_id = $1 order by rank asc`,
    [edition.id]
  );
  const events = ev.rows || [];
  if (!events.length) {
    return Response.json({ ok: false, error: "Edition has no events.", edition_id: edition.id }, { status: 409 });
  }
  const top = events[0];

  let dd;
  try {
    dd = await claudeJSON({
      system: DEEP_SYSTEM,
      maxTokens: 3200,
      user:
        `Write the Deep Dive for this week's #1 event.\n\n` +
        `EVENT: ${top.title}\n` +
        `SUMMARY: ${top.summary || ""}\n` +
        `CONTEXT SNIPPET: ${(top.raw_html || "").slice(0, 600)}\n\n` +
        `Other notable events this week (for cross-reference):\n` +
        events.slice(1).map((e) => `- ${e.title}`).join("\n") +
        `\n\nReturn JSON of this exact shape (all string fields are 2-4 tight sentences of analysis):\n` +
        `{\n` +
        `  "layers": {"world_order":"","regional":"","bilateral":"","domestic":"","actor":""},\n` +
        `  "lenses": {"realism":"","liberalism":"","constructivism":"","marxist":"","game_theory":""},\n` +
        `  "gaps": {"info":"","source_bias":"","counterfactual":"","osint":"","counter_intel":""},\n` +
        `  "implications": {"us_strategy":"","us_business":"","us_households":""},\n` +
        `  "what_to_watch": ["bullet","bullet","bullet"],\n` +
        `  "parties": [{"name":"<exact name as it appears in your prose>","type":"state|individual|org|ngo|mnc|armed_group|institution"}]\n` +
        `}\n` +
        `Use IR-theory vocabulary naturally in the lens analysis (e.g. security dilemma, balance of power, ` +
        `deterrence, soft power, weaponized interdependence) so the reader's theory-tags light up. ` +
        `Include EVERY named actor you reference in "parties".`,
    });
  } catch (e) {
    return Response.json({ ok: false, error: "Deep dive failed.", detail: String(e.message), edition_id: edition.id }, { status: 502 });
  }

  const layers = (dd && dd.layers) || {};
  const parties = Array.isArray(dd && dd.parties) ? dd.parties : [];
  layers._parties = parties; // reserved key the UI ignores when rendering the 5 layers
  const lenses = (dd && dd.lenses) || {};
  const gaps = (dd && dd.gaps) || {};
  const implications = (dd && dd.implications) || {};
  const watch = Array.isArray(dd && dd.what_to_watch)
    ? dd.what_to_watch.map((b) => "- " + String(b)).join("\n")
    : (dd && dd.what_to_watch ? String(dd.what_to_watch) : null);

  try {
    await query(`delete from public.seminar_deep_dive where seminar_id = $1`, [edition.id]);
    await query(
      `insert into public.seminar_deep_dive
         (seminar_id, event_id, layers, lenses, gaps, implications, what_to_watch)
       values ($1, (select id from public.seminar_events where seminar_id=$1 and rank=1 limit 1),
               $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6)`,
      [edition.id, JSON.stringify(layers), JSON.stringify(lenses), JSON.stringify(gaps), JSON.stringify(implications), watch]
    );
  } catch (e) {
    return Response.json({ ok: false, error: "Deep dive write failed.", detail: String(e.message), edition_id: edition.id }, { status: 500 });
  }

  // Catalogue actors (idempotent) for the Phase 2 click-in cards.
  for (const p of parties) {
    if (!p || !p.name) continue;
    const type = ["state", "individual", "org", "ngo", "mnc", "armed_group", "institution"].includes(p.type) ? p.type : "org";
    try {
      await query(
        `insert into public.seminar_actors (name, type)
         values ($1, $2::public.seminar_actor_type)
         on conflict (lower(name)) do nothing`,
        [String(p.name).slice(0, 200), type]
      );
    } catch { /* non-fatal */ }
  }

  return Response.json({
    ok: true,
    edition_id: edition.id,
    deep_dive_event: top.title,
    parties: parties.length,
  });
}

export const GET = POST;
