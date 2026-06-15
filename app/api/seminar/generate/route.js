// POST /api/seminar/generate
//   Reads the last ~8 days of ingested news, asks Claude to (1) pick the 5
//   most consequential FP events, then (2) write a full deep-dive on the #1
//   event (five-layer drill-down, five-lens analysis, gaps, implications,
//   what-to-watch, named parties). Writes seminar_editions + seminar_events
//   + seminar_deep_dive and publishes the edition.
//
//   Gated by SEMINAR_CRON_SECRET (cron / manual) OR a PIN token.
//   Idempotent per week: re-running upserts the same week's edition.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../lib/seminarAuth";
import { query } from "../../../../lib/db";
import { claudeJSON } from "../../../../lib/anthropic";
import { getSeminarWeek } from "../../../../lib/seminarWeek";
import { REGION_LABEL } from "../../../../lib/seminarFeeds";

const SELECT_SYSTEM =
  "You are a senior foreign-policy analyst building a weekly US foreign-policy " +
  "seminar. From a list of news items drawn from many national presses, identify " +
  "the FIVE most consequential foreign-policy events of the week for US strategic " +
  "interests. Prefer hard geopolitics (war, diplomacy, deterrence, sanctions, " +
  "energy, alliances, nuclear) over domestic politics or soft news. Cluster " +
  "duplicate coverage of the same event into one. Rank 1 = most consequential. " +
  "Return STRICT JSON only, no prose.";

const DEEP_SYSTEM =
  "You are a senior foreign-policy analyst and IR theorist writing the marquee " +
  "Deep Dive of a weekly US foreign-policy seminar. Write with analytical rigor, " +
  "name specific actors, and stay grounded in the provided reporting. Each prose " +
  "field should be 3-6 sentences. Return STRICT JSON only, no prose outside JSON.";

function regionLabel(code) {
  return REGION_LABEL[code] || code || "—";
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { weekStart, weekEnd } = getSeminarWeek();

  // 1) Pull candidate news for the window.
  let candidates;
  try {
    const r = await query(
      `select id, source, url, title, body_html, region_tag, worldview_tag, published_at
         from public.seminar_news_raw
        where coalesce(published_at, fetched_at) >= now() - interval '8 days'
        order by coalesce(published_at, fetched_at) desc
        limit 150`,
      []
    );
    candidates = r.rows;
  } catch (e) {
    return Response.json({ ok: false, error: "DB read failed.", detail: String(e.message) }, { status: 500 });
  }
  if (candidates.length < 5) {
    return Response.json(
      { ok: false, error: `Only ${candidates.length} news items in window — run /api/seminar/ingest first.` },
      { status: 409 }
    );
  }

  // Build a compact numbered candidate list for the selector.
  const list = candidates
    .map((c, i) => {
      const snip = (c.body_html || "").replace(/\s+/g, " ").slice(0, 160);
      return `[${i}] (${regionLabel(c.region_tag)} · ${c.source}) ${c.title}${snip ? " — " + snip : ""}`;
    })
    .join("\n");

  // 2) Selection call.
  let selection;
  try {
    selection = await claudeJSON({
      system: SELECT_SYSTEM,
      maxTokens: 1800,
      user:
        `Week of ${weekStart} to ${weekEnd}. Here are this week's candidate news items, each with an index:\n\n` +
        list +
        `\n\nReturn JSON of this exact shape:\n` +
        `{"events":[{"rank":1,"source_index":<int from the list>,"title":"<concise event title>",` +
        `"summary":"<2-3 sentence neutral summary of the EVENT (not the headline)>",` +
        `"reasoning":"<one sentence on why it is consequential for US interests>"}, ... exactly 5 items ...]}`,
    });
  } catch (e) {
    return Response.json({ ok: false, error: "Selection failed.", detail: String(e.message) }, { status: 502 });
  }

  const events = Array.isArray(selection && selection.events) ? selection.events.slice(0, 5) : [];
  if (events.length < 1) {
    return Response.json({ ok: false, error: "Model returned no events." }, { status: 502 });
  }
  // Resolve each event's source row from its index.
  const resolved = events.map((ev, idx) => {
    const ci = Number.isInteger(ev.source_index) ? candidates[ev.source_index] : null;
    return {
      rank: Number.isInteger(ev.rank) ? ev.rank : idx + 1,
      title: String(ev.title || (ci && ci.title) || "Untitled event").slice(0, 400),
      summary: ev.summary ? String(ev.summary) : null,
      reasoning: ev.reasoning ? String(ev.reasoning) : null,
      source_url: ci ? ci.url : null,
      source_name: ci ? ci.source : null,
      source_region: ci ? regionLabel(ci.region_tag) : null,
      raw_html: ci ? ci.body_html : null,
      raw_id: ci ? ci.id : null,
    };
  });
  resolved.sort((a, b) => a.rank - b.rank);
  resolved.forEach((e, i) => (e.rank = i + 1));
  const top = resolved[0];

  // 3) Upsert the edition (draft) for this week.
  let editionId;
  try {
    const r = await query(
      `insert into public.seminar_editions (week_start_date, week_end_date, status)
       values ($1, $2, 'draft')
       on conflict (week_start_date)
       do update set week_end_date = excluded.week_end_date, status = 'draft', updated_at = now()
       returning id`,
      [weekStart, weekEnd]
    );
    editionId = r.rows[0].id;
  } catch (e) {
    return Response.json({ ok: false, error: "Edition upsert failed.", detail: String(e.message) }, { status: 500 });
  }

  // Replace events for this edition.
  try {
    await query(`delete from public.seminar_events where seminar_id = $1`, [editionId]);
    for (const e of resolved) {
      await query(
        `insert into public.seminar_events
           (seminar_id, rank, title, summary, reasoning, source_url, source_name, source_region, raw_html)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [editionId, e.rank, e.title, e.summary, e.reasoning, e.source_url, e.source_name, e.source_region, e.raw_html]
      );
    }
  } catch (e) {
    return Response.json({ ok: false, error: "Event write failed.", detail: String(e.message) }, { status: 500 });
  }

  // 4) Deep-dive call on the #1 event.
  let dd;
  try {
    dd = await claudeJSON({
      system: DEEP_SYSTEM,
      maxTokens: 5000,
      user:
        `Write the Deep Dive for this week's #1 event.\n\n` +
        `EVENT: ${top.title}\n` +
        `SUMMARY: ${top.summary || ""}\n` +
        `SOURCE: ${top.source_name || ""} (${top.source_region || ""})\n` +
        `CONTEXT SNIPPET: ${(top.raw_html || "").slice(0, 600)}\n\n` +
        `Other notable events this week (for cross-reference):\n` +
        resolved.slice(1).map((e) => `- ${e.title}`).join("\n") +
        `\n\nReturn JSON of this exact shape (all string fields are 3-6 sentences of analysis):\n` +
        `{\n` +
        `  "layers": {"world_order":"","regional":"","bilateral":"","domestic":"","actor":""},\n` +
        `  "lenses": {"realism":"","liberalism":"","constructivism":"","marxist":"","game_theory":""},\n` +
        `  "gaps": {"info":"","source_bias":"","counterfactual":"","osint":"","counter_intel":""},\n` +
        `  "implications": {"us_strategy":"","us_business":"","us_households":""},\n` +
        `  "what_to_watch": ["bullet","bullet","bullet"],\n` +
        `  "parties": [{"name":"<exact name as it appears in your prose>","type":"state|individual|org|ngo|mnc|armed_group|institution"}]\n` +
        `}\n` +
        `Include EVERY named actor (states, leaders, organisations, armed groups, firms) you reference in "parties".`,
    });
  } catch (e) {
    // Selection + events are saved; surface the partial state rather than 500.
    return Response.json({ ok: false, error: "Deep dive failed.", detail: String(e.message), edition_id: editionId }, { status: 502 });
  }

  const layers = (dd && dd.layers) || {};
  const parties = Array.isArray(dd && dd.parties) ? dd.parties : [];
  // Stash the linkable party list inside layers under a reserved key the UI
  // ignores when rendering the five named layers.
  layers._parties = parties;
  const lenses = (dd && dd.lenses) || {};
  const gaps = (dd && dd.gaps) || {};
  const implications = (dd && dd.implications) || {};
  const watch = Array.isArray(dd && dd.what_to_watch)
    ? dd.what_to_watch.map((b) => "- " + String(b)).join("\n")
    : (dd && dd.what_to_watch ? String(dd.what_to_watch) : null);

  // 5) Upsert the deep dive.
  try {
    await query(`delete from public.seminar_deep_dive where seminar_id = $1`, [editionId]);
    await query(
      `insert into public.seminar_deep_dive
         (seminar_id, event_id, layers, lenses, gaps, implications, what_to_watch)
       values ($1, (select id from public.seminar_events where seminar_id=$1 and rank=1 limit 1),
               $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6)`,
      [editionId, JSON.stringify(layers), JSON.stringify(lenses), JSON.stringify(gaps), JSON.stringify(implications), watch]
    );
  } catch (e) {
    return Response.json({ ok: false, error: "Deep dive write failed.", detail: String(e.message), edition_id: editionId }, { status: 500 });
  }

  // 6) Catalogue actors (idempotent) for the Phase 2 click-in cards.
  for (const p of parties) {
    if (!p || !p.name) continue;
    const type = ["state","individual","org","ngo","mnc","armed_group","institution"].includes(p.type) ? p.type : "org";
    try {
      await query(
        `insert into public.seminar_actors (name, type)
         values ($1, $2::public.seminar_actor_type)
         on conflict (lower(name)) do nothing`,
        [String(p.name).slice(0, 200), type]
      );
    } catch { /* non-fatal */ }
  }

  // 7) Mark the raw rows used, and publish the edition.
  try {
    const usedIds = resolved.map((e) => e.raw_id).filter((x) => x != null);
    if (usedIds.length) {
      await query(
        `update public.seminar_news_raw set used_in_seminar_id = $1 where id = any($2::bigint[])`,
        [editionId, usedIds]
      );
    }
    const title = `Week of ${weekStart} — ${top.title}`.slice(0, 300);
    await query(
      `update public.seminar_editions
          set title = $2, status = 'published', published_at = now(), updated_at = now()
        where id = $1`,
      [editionId, title]
    );
  } catch (e) {
    return Response.json({ ok: false, error: "Publish step failed.", detail: String(e.message), edition_id: editionId }, { status: 500 });
  }

  return Response.json({
    ok: true,
    edition_id: editionId,
    week_start: weekStart,
    week_end: weekEnd,
    events: resolved.map((e) => ({ rank: e.rank, title: e.title, source: e.source_name })),
    deep_dive_event: top.title,
    parties: parties.length,
  });
}

export const GET = POST;
