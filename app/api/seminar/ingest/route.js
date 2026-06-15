// POST /api/seminar/ingest
//   Pulls the curated multi-source feed list, dedups by URL, tags each item
//   with its source's region/worldview, and stores it in seminar_news_raw.
//   No per-item AI summary (cost discipline) — selected events are summarised
//   at generation time.
//
//   Gated by SEMINAR_CRON_SECRET (Vercel Cron / manual curl) OR a PIN token.
//   Returns a per-source report so blocked feeds are visible, never fatal.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../lib/seminarAuth";
import { query } from "../../../../lib/db";
import { SEMINAR_FEEDS } from "../../../../lib/seminarFeeds";
import { fetchFeed } from "../../../../lib/rss";

const MAX_ITEMS_PER_FEED = 18;

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const report = [];
  let inserted = 0;

  // Fetch every feed in parallel; a failure is recorded, never thrown.
  const results = await Promise.all(
    SEMINAR_FEEDS.map(async (feed) => {
      const r = await fetchFeed(feed.url);
      return { feed, ...r };
    })
  );

  // Flatten + intra-batch dedup by URL.
  const seen = new Set();
  const rows = [];
  for (const { feed, ok, status, items, error } of results) {
    if (!ok || !items.length) {
      report.push({ source: feed.name, ok: false, status, error: error || `no items`, count: 0 });
      continue;
    }
    let kept = 0;
    for (const it of items.slice(0, MAX_ITEMS_PER_FEED)) {
      if (!it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      rows.push({
        source: feed.name,
        url: it.url,
        title: it.title,
        body_html: it.snippet || null,
        region_tag: feed.region,
        worldview_tag: feed.worldview,
        published_at: it.published_at,
      });
      kept++;
    }
    report.push({ source: feed.name, ok: true, status, count: kept });
  }

  // Bulk insert with ON CONFLICT (url) DO NOTHING. Chunked to keep parameter
  // counts sane.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    chunk.forEach((row, j) => {
      const b = j * 7;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
      params.push(row.source, row.url, row.title, row.body_html, row.region_tag, row.worldview_tag, row.published_at);
    });
    try {
      const res = await query(
        `insert into public.seminar_news_raw
           (source, url, title, body_html, region_tag, worldview_tag, published_at)
         values ${values.join(",")}
         on conflict (url) do nothing`,
        params
      );
      inserted += res.rowCount || 0;
    } catch (e) {
      report.push({ source: "_db_insert", ok: false, error: String(e.message).slice(0, 200) });
    }
  }

  const okCount = report.filter((r) => r.ok).length;
  return Response.json({
    ok: true,
    sources_total: SEMINAR_FEEDS.length,
    sources_ok: okCount,
    sources_failed: SEMINAR_FEEDS.length - okCount,
    items_fetched: rows.length,
    items_inserted: inserted,
    report,
  });
}

// Allow GET to trigger too (Vercel Cron issues GET requests).
export const GET = POST;
