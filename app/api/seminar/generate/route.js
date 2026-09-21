// POST /api/seminar/generate
//   Reads the last ~8 days of ingested news, asks Claude to pick the 15 most
//   consequential FP events under John's locked topic quota (lib/seminarQuota),
//   tags each with a display region (lib/seminarBuckets), and publishes the
//   edition. The #1 event's Deep Dive runs in a separate /deepen request.
//
//   THE RULE, enforced in code after the model returns — never by prompt alone:
//     - 15 items. Iran war <= 5 (a ceiling, not a target).
//     - The other 10 cover emerging FP, terrorism, cartels/narcotics and the
//       Americas, each with a minimum.
//     - A category with no qualifying story SAYS SO; it is never padded, and
//       never backfilled with Iran.
//     - The per-category split is stored on the edition and printed at the top.
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
  REGION_BUCKET_LABEL,
  SELECTION_GROUPS,
  regionForRow,
} from "../../../../lib/seminarBuckets";
import {
  TOTAL_ITEMS,
  IRAN_BUCKET,
  IRAN_MAX,
  REQUIRED_BUCKETS,
  bucketDef,
  reconcileCategory,
  buildCandidatePool,
  poolBucketCounts,
  enforceQuotas,
  formatSplitLine,
  validateEdition,
} from "../../../../lib/seminarQuota";

// Candidate pool. A flat newest-first read let the high-volume feeds (Press TV,
// Tehran Times, Times of Israel, the wires) fill the list before low-volume
// Americas / crime feeds (InSight Crime, Borderland Beat, Caracas Chronicles,
// Reforma) were ever seen. So: cap rows PER SOURCE and PER REGION TAG in SQL,
// then buildCandidatePool reserves slots per required category and caps Iran.
const PER_SOURCE_CAP = 8;
const PER_REGION_CAP = 40;
const RAW_LIMIT = 400;
const POOL_LIMIT = 200;

function regionLabel(code) {
  return REGION_LABEL[code] || code || "—";
}

function selectSystem(group) {
  const iranRule = group.buckets.includes(IRAN_BUCKET)
    ? ` File AT MOST ${IRAN_MAX} iran_war events — that is a ceiling, not a target; ` +
      "anything past it is cut in code afterwards, so spend spare picks on terrorism instead."
    : " Do NOT file anything about the Iran war — another desk owns it, and it is capped.";
  const americasRule = group.buckets.includes("americas")
    ? " A cartel/narcotics story is cartels_narcotics even when it happens in Mexico; " +
      "a Latin America story is americas even when Washington is a party. Do not let a " +
      "Washington-centric framing absorb a hemisphere story."
    : "";
  const worldRule = group.buckets.includes("emerging_fp")
    ? " Spread your emerging-foreign-policy picks across the world — Europe/Russia, " +
      "East Asia, South Asia, Africa, trade and geoeconomics, global institutions — rather " +
      "than letting one theatre take them all. us_foreign_policy is capped at 2 in code."
    : "";
  return (
    "You are a senior foreign-policy analyst building a weekly US foreign-policy " +
    `seminar. You are staffing ONE DESK of that seminar: ${group.label}. From a list of ` +
    `news items drawn from many national presses, identify the ${group.ask} most ` +
    "consequential events of the week **that fall inside your desk's categories** for US " +
    "strategic interests. Prefer hard security and geopolitics over soft news. Ignore items " +
    "outside your categories entirely — other desks cover them. Cluster duplicate coverage " +
    "of the same event into one pick." +
    iranRule + americasRule + worldRule +
    " If one of your categories genuinely has no qualifying story this week, leave it " +
    "uncovered and name it in \"short_categories\" — NEVER stretch an unrelated story to " +
    "fill it. Score each pick's consequence for US strategic interests 0-100; the scores " +
    "are compared against the other desks', so be honest. Return STRICT JSON only, no prose."
  );
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { weekStart, weekEnd } = getSeminarWeek();

  // 1) Pull candidate news for the window, capped per source and per region.
  let rows;
  try {
    const r = await query(
      `with recent as (
         select id, source, url, title, body_html, region_tag,
                coalesce(published_at, fetched_at) as ts
           from public.seminar_news_raw
          where coalesce(published_at, fetched_at) >= now() - interval '8 days'
       ),
       ranked as (
         select *,
                row_number() over (partition by source order by ts desc) as rn_source,
                row_number() over (partition by region_tag order by ts desc) as rn_region
           from recent
       )
       select id, source, url, title, body_html, region_tag
         from ranked
        where rn_source <= $1 and rn_region <= $2
        order by ts desc
        limit $3`,
      [PER_SOURCE_CAP, PER_REGION_CAP, RAW_LIMIT]
    );
    rows = r.rows;
  } catch (e) {
    return Response.json({ ok: false, error: "DB read failed.", detail: String(e.message) }, { status: 500 });
  }
  if (rows.length < 5) {
    return Response.json(
      { ok: false, error: `Only ${rows.length} news items in window — run /api/seminar/ingest first.` },
      { status: 409 }
    );
  }

  // Shape the pool: every required category reaches the prompt, Iran is capped.
  const pool = buildCandidatePool(rows, { limit: POOL_LIMIT });
  const poolCounts = poolBucketCounts(pool);

  // Compact numbered list. The classifier's guess is a hint only — the desks
  // may override it, and reconcileCategory / enforceQuotas re-check the result.
  const list = pool
    .map((c, i) => {
      const r = c.row;
      const snip = (r.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 140);
      return `[${i}] (${regionLabel(r.region_tag)} · ${r.source}${c.bucket ? " · likely:" + c.bucket : ""}) ${r.title}${snip ? " — " + snip : ""}`;
    })
    .join("\n");

  const regionMenu = REGION_BUCKET_KEYS.map((k) => `${k} (${REGION_BUCKET_LABEL[k]})`).join(", ");

  // 2) Selection — one call per TOPIC desk, all three in flight at once. A desk
  //    that fails is recorded and skipped; enforceQuotas then backfills its
  //    categories from the pool, or reports them short.
  const desks = await Promise.all(
    SELECTION_GROUPS.map(async (group) => {
      const catLines = group.buckets.map((b) => `  - ${bucketDef(b).desc}`).join("\n");
      try {
        const out = await claudeJSON({
          system: selectSystem(group),
          maxTokens: 2600,
          user:
            `Week of ${weekStart} to ${weekEnd}. Here are this week's candidate news items, each with an index ` +
            `and a rough category hint:\n\n` +
            list +
            `\n\nYOUR DESK'S CATEGORIES (assign each event to exactly ONE):\n${catLines}\n\n` +
            `Also tag each event with the ONE world region it is about: ${regionMenu}.\n\n` +
            `Pick up to ${group.ask} events, best first. Keep "summary" to 2 short sentences ` +
            `(240 characters max) and "reasoning" to one clause (140 characters max).\n\n` +
            `Return JSON of this exact shape:\n` +
            `{"events":[{"source_index":<int from the list>,"title":"<concise event title>",` +
            `"summary":"<2 short sentences on the EVENT, not the headline>",` +
            `"reasoning":"<one clause on why it matters for US interests>",` +
            `"consequence":<0-100>,` +
            `"category":"<one of: ${group.buckets.join(" | ")}>",` +
            `"region_bucket":"<one of: ${REGION_BUCKET_KEYS.join(" | ")}>"}, ... up to ${group.ask} items ...],` +
            `"short_categories":["<category key your desk could not fill>", ...]}`,
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

  // Normalise each desk's picks: resolve the source row, settle the category
  // (an Iran-war story counts as iran_war whichever desk filed it), and drop
  // cross-desk duplicates.
  const seenIdx = new Set();
  const seenTokenSets = [];
  let dropped = 0;
  let reclassifiedToIran = 0;
  const perDesk = desks.map(({ group, out }) => {
    const raw = Array.isArray(out && out.events) ? out.events : [];
    const picks = [];
    for (const ev of raw) {
      if (picks.length >= group.ask) break;
      const c = Number.isInteger(ev.source_index) ? pool[ev.source_index] : null;
      const row = c ? c.row : null;
      const title = String(ev.title || (row && row.title) || "Untitled event").slice(0, 400);
      const tokens = titleTokens(title);
      if (row && seenIdx.has(ev.source_index)) { dropped++; continue; }
      if (isDuplicateTitle(tokens, seenTokenSets)) { dropped++; continue; }
      if (row) seenIdx.add(ev.source_index);
      if (tokens.size) seenTokenSets.push(tokens);

      const readAs = {
        title: `${title} ${row ? row.title : ""}`,
        body_html: row ? row.body_html : "",
        region_tag: row ? row.region_tag : "",
      };
      const claimed = group.buckets.includes(ev.category) ? ev.category : null;
      let bucket = reconcileCategory(claimed, readAs);
      if (bucket === IRAN_BUCKET && claimed && claimed !== IRAN_BUCKET) reclassifiedToIran++;
      if (!bucket) bucket = group.buckets.find((b) => b !== IRAN_BUCKET);

      const score = Number(ev.consequence);
      picks.push({
        desk: group.key,
        consequence: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 50,
        title,
        summary: ev.summary ? String(ev.summary) : null,
        reasoning: ev.reasoning ? String(ev.reasoning) : null,
        bucket,
        region_bucket: REGION_BUCKET_KEYS.includes(ev.region_bucket) ? ev.region_bucket : regionForRow(row, bucket),
        source_row: row,
      });
    }
    picks.sort((a, b) => b.consequence - a.consequence);
    return { group, picks };
  });

  // 3) Merge: each desk's floor goes best-per-category first, the open slots
  //    to the strongest leftovers from any desk.
  const merged = mergeDeskPicks(perDesk, SEMINAR_EVENT_TARGET, (p) => p.bucket);
  const mergedSet = new Set(merged);
  const leftovers = perDesk
    .flatMap((d) => d.picks)
    .filter((p) => !mergedSet.has(p) && p.source_row)
    .sort((a, b) => b.consequence - a.consequence);

  // Backfill pool for the enforcer: the desks' own unused picks first (they are
  // model-written, with summaries), then raw feed rows the classifier places —
  // minus anything that near-duplicates a story already on the page.
  const leftoverByRowId = new Map(leftovers.map((p) => [p.source_row.id, p]));
  const seenForPool = [];
  for (const p of merged) {
    seenForPool.push(titleTokens(p.title));
    if (p.source_row) seenForPool.push(titleTokens(p.source_row.title));
  }
  const enforcePool = [];
  for (const p of leftovers) {
    enforcePool.push({ row: p.source_row, bucket: p.bucket });
    seenForPool.push(titleTokens(p.title), titleTokens(p.source_row.title));
  }
  for (const c of pool) {
    if (!c.bucket || leftoverByRowId.has(c.row.id)) continue;
    const tok = titleTokens(c.row.title);
    if (isDuplicateTitle(tok, seenForPool)) continue;
    seenForPool.push(tok);
    enforcePool.push(c);
  }

  // 4) ENFORCE. Authoritative: the Iran ceiling and the minimums hold here
  //    regardless of what the desks returned.
  const staged = merged.map((p, i) => ({
    rank: i + 1,
    title: p.title,
    summary: p.summary,
    reasoning: p.reasoning,
    bucket: p.bucket,
    source_row: p.source_row,
    origin: "model",
    pick: p,
  }));
  const enforced = enforceQuotas(staged, enforcePool, { total: TOTAL_ITEMS });

  const resolved = enforced.items.map((it) => {
    const row = it.source_row;
    const p = it.pick || (row ? leftoverByRowId.get(row.id) : null) || null;
    const snippet = row
      ? (row.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || null
      : null;
    return {
      rank: it.rank,
      category: it.bucket,
      title: p ? p.title : it.title,
      summary: p ? p.summary : snippet,
      reasoning: p ? p.reasoning : null,
      region_bucket: p ? p.region_bucket : regionForRow(row, it.bucket),
      consequence: p ? p.consequence : null,
      desk: p ? p.desk : null,
      origin: it.origin === "model" ? "model" : p ? "backfill_desk" : "backfill_feed",
      source_url: row ? row.url : null,
      source_name: row ? row.source : null,
      source_region: row ? regionLabel(row.region_tag) : null,
      raw_html: row ? row.body_html : null,
      raw_id: row ? row.id : null,
    };
  });
  if (resolved.length < 1) {
    return Response.json({ ok: false, error: "No events survived selection.", desk_errors: deskErrors }, { status: 502 });
  }

  const counts = enforced.counts;
  const shortfalls = enforced.shortfalls;
  const splitLine = formatSplitLine(counts, shortfalls, resolved.length);
  const validation = validateEdition(counts, shortfalls, resolved.length);
  if (!validation.ok) {
    // Should be unreachable — enforceQuotas guarantees the rule. If it ever
    // is reached, keep last week's edition live rather than publish a breach.
    return Response.json(
      { ok: false, error: "Edition failed the quota rule; not published.", problems: validation.problems, split_line: splitLine },
      { status: 500 }
    );
  }
  const top = resolved[0];

  // Region coverage (the presentation axis) + the quota detail in `_meta`.
  const regionCoverage = {};
  for (const e of resolved) {
    if (e.region_bucket) regionCoverage[e.region_bucket] = (regionCoverage[e.region_bucket] || 0) + 1;
  }
  const underweighted = REGION_BUCKET_KEYS.filter((b) => !regionCoverage[b]);
  const modelShort = desks.flatMap(({ out }) =>
    Array.isArray(out && out.short_categories) ? out.short_categories.map(String) : []
  );
  regionCoverage._meta = {
    version: 3,
    total: resolved.length,
    target_total: TOTAL_ITEMS,
    iran_max: IRAN_MAX,
    minimums: Object.fromEntries(REQUIRED_BUCKETS.map((b) => [b.key, b.min])),
    category_counts: counts,
    split_line: splitLine,
    shortfalls,
    event_categories: resolved.map((e) => ({ rank: e.rank, title: e.title, category: e.category })),
    backfilled_from_desks: resolved.filter((e) => e.origin === "backfill_desk").length,
    backfilled_from_feeds: resolved.filter((e) => e.origin === "backfill_feed").length,
    dropped_by_enforcer: enforced.dropped.length,
    reclassified_to_iran: reclassifiedToIran,
    desk_short_categories: modelShort,
    pool_counts: poolCounts,
    generated_at: new Date().toISOString(),
  };

  // 5) Upsert the edition (draft) for this week.
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
  // selection, so the 1..N re-rank above never collides with them.
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

  // 6) Mark the raw rows used, and PUBLISH the edition immediately.
  //    The marquee Deep Dive is generated by a separate /api/seminar/deepen
  //    call (chained by the Monday cron at 11:30) so each request makes at most
  //    ONE round of Claude calls and stays well under the 60s Hobby function
  //    cap.
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

  // 7) Best-effort: kick off the Deep Dive in a separate request so a manual
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

  const { _meta, ...regionCounts } = regionCoverage;
  return Response.json({
    ok: true,
    edition_id: editionId,
    week_start: weekStart,
    week_end: weekEnd,
    split_line: splitLine,
    item_count: resolved.length,
    category_counts: counts,
    shortfalls,
    iran_ceiling: IRAN_MAX,
    validation,
    events: resolved.map((e) => ({
      rank: e.rank, category: e.category, title: e.title, source: e.source_name,
      region_bucket: e.region_bucket, consequence: e.consequence, desk: e.desk, origin: e.origin,
    })),
    region_coverage: regionCounts,
    underweighted_regions: underweighted,
    enforcement: {
      candidates_raw: rows.length,
      pool_size: pool.length,
      pool_counts: poolCounts,
      desk_duplicates_dropped: dropped,
      reclassified_to_iran: reclassifiedToIran,
      dropped_by_enforcer: enforced.dropped.map((d) => ({ title: d.title, bucket: d.bucket, why: d.dropped_because })),
      backfilled_from_desks: _meta.backfilled_from_desks,
      backfilled_from_feeds: _meta.backfilled_from_feeds,
      desk_short_categories: modelShort,
    },
    deep_dive: "queued (call /api/seminar/deepen)",
    desk_errors: deskErrors.length ? deskErrors : undefined,
  });
}

export const GET = POST;
