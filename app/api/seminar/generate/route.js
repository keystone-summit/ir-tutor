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
import { getSeminarWeek, weekRangeLabel } from "../../../../lib/seminarWeek";
import { REGION_LABEL } from "../../../../lib/seminarFeeds";

// Phase 3.5 — the 5-region weekly quota. The selector must spread the five
// events across these buckets where the week's news supports it, and report any
// bucket it could NOT fill as "underweighted" rather than skewing toward one region.
const REGION_BUCKETS = ["middle_east", "asia", "americas", "europe_russia", "brics_trade"];
const BUCKET_DESC =
  "middle_east (Middle East: Iran, Israel, Gulf, Levant), " +
  "asia (Asia: China, India, Korea, Japan, SE Asia), " +
  "americas (Americas: US domestic-foreign, Latin America, Mexico/cartels, Venezuela), " +
  "europe_russia (Europe & Russia: EU, NATO, Ukraine, Russia), " +
  "brics_trade (BRICS / global-trade & geoeconomics: de-dollarization, sanctions, SWIFT, supply chains, BRICS bloc)";

const SELECT_SYSTEM =
  "You are a senior foreign-policy analyst building a weekly US foreign-policy " +
  "seminar with GLOBAL coverage. From a list of news items drawn from many national " +
  "presses, identify the FIVE most consequential foreign-policy events of the week " +
  "for US strategic interests. Prefer hard geopolitics (war, diplomacy, deterrence, " +
  "sanctions, energy, alliances, nuclear, narco-state security) over domestic politics " +
  "or soft news. CRITICAL: deliberately spread the five events across world regions — " +
  "aim to cover Middle East, Asia, the Americas, Europe/Russia, and a BRICS/global-trade " +
  "story — rather than letting one region dominate. Only repeat a region if a second " +
  "story there is genuinely more consequential than the best available story in an " +
  "uncovered region. Cluster duplicate coverage of the same event into one. " +
  "Rank 1 = most consequential. Return STRICT JSON only, no prose.";

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
        limit 90`,
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
      maxTokens: 1400,
      user:
        `Week of ${weekStart} to ${weekEnd}. Here are this week's candidate news items, each with an index:\n\n` +
        list +
        `\n\nRegion buckets (assign each event to exactly ONE): ${BUCKET_DESC}.\n` +
        `Spread the five events across as many distinct buckets as the news supports. If a bucket ` +
        `genuinely has no qualifying story this week, leave it uncovered and name it in ` +
        `"underweighted_regions" — do NOT invent or stretch a weak story to fill it.\n\n` +
        `Return JSON of this exact shape:\n` +
        `{"events":[{"rank":1,"source_index":<int from the list>,"title":"<concise event title>",` +
        `"summary":"<2-3 sentence neutral summary of the EVENT (not the headline)>",` +
        `"reasoning":"<one sentence on why it is consequential for US interests>",` +
        `"region_bucket":"<one of: ${REGION_BUCKETS.join(" | ")}>"}, ... exactly 5 items ...],` +
        `"underweighted_regions":["<bucket key the week's news could not fill>", ...]}`,
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
    const bucket = REGION_BUCKETS.includes(ev.region_bucket) ? ev.region_bucket : null;
    return {
      rank: Number.isInteger(ev.rank) ? ev.rank : idx + 1,
      title: String(ev.title || (ci && ci.title) || "Untitled event").slice(0, 400),
      summary: ev.summary ? String(ev.summary) : null,
      reasoning: ev.reasoning ? String(ev.reasoning) : null,
      region_bucket: bucket,
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

  // Phase 3.5 — tally region coverage and the buckets the week could not fill.
  const regionCoverage = {};
  for (const e of resolved) {
    if (e.region_bucket) regionCoverage[e.region_bucket] = (regionCoverage[e.region_bucket] || 0) + 1;
  }
  const modelUnder = Array.isArray(selection && selection.underweighted_regions)
    ? selection.underweighted_regions.filter((b) => REGION_BUCKETS.includes(b))
    : [];
  const underweighted = Array.from(
    new Set([...modelUnder, ...REGION_BUCKETS.filter((b) => !regionCoverage[b])])
  );

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
           (seminar_id, rank, title, summary, reasoning, source_url, source_name, source_region, raw_html, region_bucket)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [editionId, e.rank, e.title, e.summary, e.reasoning, e.source_url, e.source_name, e.source_region, e.raw_html, e.region_bucket]
      );
    }
  } catch (e) {
    return Response.json({ ok: false, error: "Event write failed.", detail: String(e.message) }, { status: 500 });
  }

  // 4) Mark the raw rows used, and PUBLISH the edition immediately.
  //    The marquee Deep Dive is generated by a separate /api/seminar/deepen
  //    call (chained by the Monday cron at 11:30) so each request makes at most
  //    ONE Claude call and stays well under the 60s Hobby function cap — two
  //    sequential Claude calls in one request was timing out. The reader page
  //    degrades gracefully (Briefing + region coverage) until deepen runs.
  try {
    const usedIds = resolved.map((e) => e.raw_id).filter((x) => x != null);
    if (usedIds.length) {
      await query(
        `update public.seminar_news_raw set used_in_seminar_id = $1 where id = any($2::bigint[])`,
        [editionId, usedIds]
      );
    }
    const title = `Week of ${weekRangeLabel(weekStart, weekEnd)} — ${top.title}`.slice(0, 300);
    await query(
      `update public.seminar_editions
          set title = $2, status = 'published', published_at = now(), updated_at = now(),
              region_coverage = $3::jsonb, underweighted_regions = $4::text[]
        where id = $1`,
      [editionId, title, JSON.stringify(regionCoverage), underweighted]
    );
  } catch (e) {
    return Response.json({ ok: false, error: "Publish step failed.", detail: String(e.message), edition_id: editionId }, { status: 500 });
  }

  // 5) Best-effort: kick off the Deep Dive in a separate request so a manual
  //    generate (outside the cron chain) still ends up with a full edition.
  //    Fire-and-forget — we don't await it (that would re-introduce the timeout).
  try {
    const origin = new URL(req.url).origin;
    const secret = process.env.SEMINAR_CRON_SECRET || process.env.CRON_SECRET;
    if (secret) {
      fetch(`${origin}/api/seminar/deepen?seminar_id=${editionId}`, {
        headers: { authorization: `Bearer ${secret}` },
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return Response.json({
    ok: true,
    edition_id: editionId,
    week_start: weekStart,
    week_end: weekEnd,
    events: resolved.map((e) => ({ rank: e.rank, title: e.title, source: e.source_name, region_bucket: e.region_bucket })),
    deep_dive: "queued (call /api/seminar/deepen)",
    region_coverage: regionCoverage,
    underweighted_regions: underweighted,
  });
}

export const GET = POST;
