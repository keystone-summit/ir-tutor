// POST /api/seminar/generate
//   Reads the last ~8 days of ingested news, asks Claude to (1) pick the 15
//   most consequential FP events spread over eight region/theme buckets, then
//   (2) write a full deep-dive on the #1 event (five-layer drill-down,
//   five-lens analysis, gaps, implications, what-to-watch, named parties).
//   Writes seminar_editions + seminar_events + seminar_deep_dive and publishes
//   the edition.
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
import { titleTokens, isDuplicateTitle, mergeDeskPicks } from "../../../../lib/seminarSelection";
import {
  SEMINAR_EVENT_TARGET,
  REGION_BUCKET_KEYS,
  BUCKET_DESC,
  SELECTION_GROUPS,
} from "../../../../lib/seminarBuckets";

// Candidate pool handed to the selector. Pulling the most recent N outright
// let the highest-volume feeds (US wires, think-tanks) eat the list — the last
// 8 days run ~400 items, of which US+INTL+NGO alone are ~250. PER_REGION_CAP
// takes the freshest N from each region tag first, so a five-item-a-week
// Africa or Mexico feed still reaches the selector.
const CANDIDATE_LIMIT = 240;
const PER_REGION_CAP = 34;

function selectSystem(group) {
  return (
    "You are a senior foreign-policy analyst building a weekly US foreign-policy " +
    "seminar with GLOBAL coverage. You are staffing ONE DESK of that seminar: " +
    `${group.label}. From a list of news items drawn from many national presses, ` +
    `identify the ${group.ask} most consequential foreign-policy events of the week ` +
    "**that fall inside your desk's buckets** for US strategic interests. Prefer hard " +
    "geopolitics (war, diplomacy, deterrence, sanctions, energy, alliances, nuclear, " +
    "narco-state security, transnational institutions) over domestic politics or soft " +
    "news. Ignore items outside your buckets entirely — another desk covers them. " +
    "Within your desk, spread the picks across your buckets rather than letting one " +
    "dominate, and cluster duplicate coverage of the same event into one. Score each " +
    "pick's consequence for US strategic interests on a 0-100 scale; those scores are " +
    "compared against the other desks', so be honest — a quiet week on your desk should " +
    "produce low scores, not inflated ones. Return STRICT JSON only, no prose."
  );
}

function regionLabel(code) {
  return REGION_LABEL[code] || code || "—";
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { weekStart, weekEnd } = getSeminarWeek();

  // 1) Pull candidate news for the window, balanced across region tags.
  let candidates;
  try {
    const r = await query(
      `with ranked as (
         select id, source, url, title, body_html, region_tag,
                coalesce(published_at, fetched_at) as ts,
                row_number() over (
                  partition by region_tag
                  order by coalesce(published_at, fetched_at) desc
                ) as rn
           from public.seminar_news_raw
          where coalesce(published_at, fetched_at) >= now() - interval '8 days'
       )
       select id, source, url, title, body_html, region_tag
         from ranked
        where rn <= $1
        order by ts desc
        limit $2`,
      [PER_REGION_CAP, CANDIDATE_LIMIT]
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

  // 2) Selection — one call per desk, all three in flight at once. A desk that
  //    fails is recorded and skipped rather than failing the whole week: two
  //    desks' worth of briefing beats none.
  const desks = await Promise.all(
    SELECTION_GROUPS.map(async (group) => {
      const bucketLines = group.buckets.map((b) => `  - ${b}: ${BUCKET_DESC[b]}`).join("\n");
      try {
        const out = await claudeJSON({
          system: selectSystem(group),
          maxTokens: 2600,
          user:
            `Week of ${weekStart} to ${weekEnd}. Here are this week's candidate news items, each with an index:\n\n` +
            list +
            `\n\nYOUR DESK'S BUCKETS (assign each event to exactly ONE of these):\n${bucketLines}\n\n` +
            `Pick up to ${group.ask} events, best first. If one of your buckets genuinely has no ` +
            `qualifying story this week, leave it uncovered and name it in "underweighted_regions" ` +
            `— do NOT invent or stretch a weak story to fill it, and do NOT reach outside your buckets.\n\n` +
            `Return JSON of this exact shape:\n` +
            `{"events":[{"source_index":<int from the list>,"title":"<concise event title>",` +
            `"summary":"<2-3 sentence neutral summary of the EVENT (not the headline)>",` +
            `"reasoning":"<one sentence on why it is consequential for US interests>",` +
            `"consequence":<0-100>,` +
            `"region_bucket":"<one of: ${group.buckets.join(" | ")}>"}, ... up to ${group.ask} items ...],` +
            `"underweighted_regions":["<bucket key your desk could not fill>", ...]}`,
        });
        return { group, out, error: null };
      } catch (e) {
        return { group, out: null, error: String(e.message).slice(0, 200) };
      }
    })
  );

  const deskErrors = desks.filter((d) => d.error).map((d) => ({ desk: d.group.key, error: d.error }));
  if (deskErrors.length === SELECTION_GROUPS.length) {
    return Response.json(
      { ok: false, error: "Selection failed on every desk.", detail: deskErrors },
      { status: 502 }
    );
  }

  // Normalise each desk's picks, keeping only in-bucket rows with a resolvable source.
  const seenIdx = new Set();
  const seenTokenSets = [];
  let dropped = 0;
  const perDesk = desks.map(({ group, out }) => {
    const raw = Array.isArray(out && out.events) ? out.events : [];
    const picks = [];
    for (const ev of raw) {
      if (picks.length >= group.ask) break;
      const ci = Number.isInteger(ev.source_index) ? candidates[ev.source_index] : null;
      const bucket = group.buckets.includes(ev.region_bucket) ? ev.region_bucket : group.buckets[0];
      const title = String(ev.title || (ci && ci.title) || "Untitled event").slice(0, 400);
      const tokens = titleTokens(title);
      // Cross-desk de-dup: a cross-cutting story (say a Saudi-Turkey-Pakistan
      // defence pact) can legitimately look in-bucket to two desks. Desks are
      // walked in SELECTION_GROUPS order, so the winner is deterministic.
      if (ci && seenIdx.has(ev.source_index)) { dropped++; continue; }
      if (isDuplicateTitle(tokens, seenTokenSets)) { dropped++; continue; }
      if (ci) seenIdx.add(ev.source_index);
      if (tokens.size) seenTokenSets.push(tokens);
      const score = Number(ev.consequence);
      picks.push({
        desk: group.key,
        consequence: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 50,
        title,
        summary: ev.summary ? String(ev.summary) : null,
        reasoning: ev.reasoning ? String(ev.reasoning) : null,
        region_bucket: bucket,
        source_url: ci ? ci.url : null,
        source_name: ci ? ci.source : null,
        source_region: ci ? regionLabel(ci.region_tag) : null,
        raw_html: ci ? ci.body_html : null,
        raw_id: ci ? ci.id : null,
      });
    }
    picks.sort((a, b) => b.consequence - a.consequence);
    return { group, picks };
  });

  const resolved = mergeDeskPicks(perDesk, SEMINAR_EVENT_TARGET);
  if (resolved.length < 1) {
    return Response.json({ ok: false, error: "Model returned no events." }, { status: 502 });
  }
  resolved.forEach((e, i) => (e.rank = i + 1));
  const top = resolved[0];

  // Tally region coverage and the buckets the week could not fill.
  const regionCoverage = {};
  for (const e of resolved) {
    if (e.region_bucket) regionCoverage[e.region_bucket] = (regionCoverage[e.region_bucket] || 0) + 1;
  }
  const modelUnder = desks.flatMap(({ out }) =>
    Array.isArray(out && out.underweighted_regions)
      ? out.underweighted_regions.filter((b) => REGION_BUCKET_KEYS.includes(b))
      : []
  );
  const underweighted = Array.from(
    new Set([...modelUnder, ...REGION_BUCKET_KEYS.filter((b) => !regionCoverage[b])])
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
  //
  // Scoped to the auto-selected rows: `curated` events were added by hand to
  // this edition (see supabase_migration_seminar_curated.sql) and must survive
  // a regeneration — otherwise the Thursday refresh or the daily heartbeat
  // self-heal silently deletes them. Curated rows are ranked after the auto
  // selection, so the 1..N re-rank below never collides with them.
  try {
    try {
      await query(
        `delete from public.seminar_events
          where seminar_id = $1 and coalesce(curated, false) = false`,
        [editionId]
      );
    } catch {
      // Pre-migration DB (no `curated` column) — fall back to the old
      // delete-everything behaviour rather than failing the whole run.
      await query(`delete from public.seminar_events where seminar_id = $1`, [editionId]);
    }
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
  //    ONE round of Claude calls and stays well under the 60s Hobby function
  //    cap — two sequential Claude stages in one request was timing out. The
  //    reader page degrades gracefully (Briefing + region coverage) until
  //    deepen runs.
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
    target_events: SEMINAR_EVENT_TARGET,
    candidates: candidates.length,
    duplicates_dropped: dropped,
    events: resolved.map((e) => ({
      rank: e.rank, title: e.title, source: e.source_name,
      region_bucket: e.region_bucket, consequence: e.consequence, desk: e.desk,
    })),
    deep_dive: "queued (call /api/seminar/deepen)",
    region_coverage: regionCoverage,
    underweighted_regions: underweighted,
    desk_errors: deskErrors.length ? deskErrors : undefined,
  });
}

export const GET = POST;
