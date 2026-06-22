// GET/POST /api/seminar/heartbeat
//   Daily skip-week monitor for the weekly seminar pipeline.
//
//   The Monday chain (ingest -> generate -> deepen -> extract -> match)
//   publishes one edition per week. If a Monday run is missed, NO new edition
//   appears and the reader silently keeps seeing last week's briefing. This
//   endpoint runs daily (Vercel cron, 15:00 UTC — comfortably after the 13:00
//   Monday chain finishes) and:
//
//     1. Computes pipeline health from the latest published edition
//        (seminarHealth: up-to-date? days since last publish? skip?).
//     2. If a skip is detected (this week's edition is missing AND it's past
//        the Monday window), it SELF-HEALS: awaits a fresh ingest, then
//        fire-and-forgets generate (which chains deepen) so the missed week
//        catches up within a day — no human in the loop.
//     3. Always returns a JSON health report (visible in Vercel cron logs).
//
//   The reader page also surfaces the same skip via a banner (see
//   /api/seminar/current -> health, and SeminarView's stale banner), so John
//   sees it the moment he opens the seminar even before the self-heal lands.
//
//   Gated by the cron secret (Vercel sends Authorization: Bearer CRON_SECRET)
//   OR a PIN token, same as the other pipeline endpoints.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../lib/seminarAuth";
import { query } from "../../../../lib/db";
import { seminarHealth } from "../../../../lib/seminarWeek";

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  // 1) Read the latest published edition and compute health.
  let health;
  try {
    const r = await query(
      `select week_start_date, published_at from public.seminar_editions
        where status = 'published' order by week_start_date desc limit 1`,
      []
    );
    const row = r.rows[0];
    health = seminarHealth({
      latestWeekStart: row ? row.week_start_date : null,
      latestPublishedAt: row ? row.published_at : null,
    });
  } catch (e) {
    return Response.json({ ok: false, error: "DB read failed.", detail: String(e.message) }, { status: 500 });
  }

  // Healthy — this week's edition is already published. Nothing to do.
  if (health.up_to_date) {
    return Response.json({ ok: true, healthy: true, action: "none", health });
  }

  // 2) A miss: the freshest possible edition (week_start = expected_week_start)
  //    is NOT present. By 15:00 UTC the Monday chain should have produced it, so
  //    this is a genuine skip. Self-heal: ingest fresh news, then trigger
  //    generate (which fire-and-forgets the Deep Dive). extract/match are
  //    restored by the next normal Monday chain; the reader degrades gracefully
  //    (Briefing + Deep Dive) until then.
  const origin = new URL(req.url).origin;
  const secret = process.env.SEMINAR_CRON_SECRET || process.env.CRON_SECRET;
  const steps = {};

  if (!secret) {
    // Can't authenticate the self-heal sub-calls. Report the skip so the cron
    // log + reader banner still flag it.
    return Response.json({ ok: true, healthy: false, action: "alert_only_no_secret", health });
  }

  // Await ingest so generate has a fresh news window to read.
  try {
    const ig = await fetch(`${origin}/api/seminar/ingest`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    steps.ingest = ig.status;
  } catch (e) {
    steps.ingest = `error: ${String(e.message).slice(0, 120)}`;
  }

  // Fire-and-forget generate (it chains deepen itself). Not awaited so this
  // request stays well under the 60s cap — generate runs in its own request.
  try {
    fetch(`${origin}/api/seminar/generate`, {
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => {});
    steps.generate = "triggered";
  } catch (e) {
    steps.generate = `error: ${String(e.message).slice(0, 120)}`;
  }

  return Response.json({
    ok: true,
    healthy: false,
    action: "self_heal_triggered",
    skip: health.skip,
    health,
    steps,
  });
}

// Vercel Cron issues GET requests.
export const GET = POST;
