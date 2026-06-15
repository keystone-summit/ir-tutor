// GET /api/seminar/debate-openings?seminar_id=<n>
//   PIN-gated. Returns the four IR-theory personas' opening reads on this
//   edition's #1 Deep Dive event. One Claude call per edition, cached on
//   seminar_deep_dive.debate_openings for 7 days.
//
//   Response: { ok, openings:[{ key, label, school, blurb, opening }], cached }
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { claudeJSON } from "../../../../lib/anthropic";
import { PERSONAS, buildEventContext } from "../../../../lib/seminar_personas";

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

const OPENINGS_SYSTEM =
  "You are running a graduate IR seminar's debate panel. Four analysts from " +
  "four schools each give a SHORT opening read of this week's event, true to " +
  "their school's DNA. Each opening is 3-4 sentences, sharp and distinct from " +
  "the others. Return STRICT JSON only.";

function withMeta(openingsByKey) {
  return PERSONAS.map((p) => ({
    key: p.key,
    label: p.label,
    school: p.school,
    blurb: p.blurb,
    opening: (openingsByKey && openingsByKey[p.key]) || "",
  }));
}

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const seminarId = parseInt(searchParams.get("seminar_id"), 10);
  if (!Number.isInteger(seminarId)) {
    return Response.json({ ok: false, error: "seminar_id required." }, { status: 400 });
  }

  // Load edition + event + deep dive (+ any cached openings).
  let edition, event, dd;
  try {
    const er = await query(
      `select id, title, week_start_date, week_end_date from public.seminar_editions where id = $1 limit 1`,
      [seminarId]
    );
    edition = er.rows[0];
    if (!edition) return Response.json({ ok: false, error: "Edition not found." }, { status: 404 });

    const ev = await query(
      `select id, title, summary, reasoning from public.seminar_events where seminar_id = $1 and rank = 1 limit 1`,
      [seminarId]
    );
    event = ev.rows[0] || null;

    const ddr = await query(
      `select layers, debate_openings, debate_openings_at from public.seminar_deep_dive where seminar_id = $1 limit 1`,
      [seminarId]
    );
    dd = ddr.rows[0] || null;
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }

  // Serve cached openings if fresh.
  const last = dd && dd.debate_openings_at ? Date.parse(dd.debate_openings_at) : 0;
  if (dd && dd.debate_openings && last && Date.now() - last < CACHE_MS) {
    return Response.json({ ok: true, openings: withMeta(dd.debate_openings), cached: true });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  const ctx = buildEventContext({ edition, event, deepDive: dd });
  const personaBrief = PERSONAS.map((p) => `- ${p.key} (${p.label}, ${p.school}): ${p.blurb}`).join("\n");

  let out;
  try {
    out = await claudeJSON({
      system: OPENINGS_SYSTEM,
      maxTokens: 2200,
      user:
        `This week's seminar event:\n${ctx}\n\n` +
        `The four panelists:\n${personaBrief}\n\n` +
        `Write each panelist's opening read (3-4 sentences, in-character, ` +
        `analytically distinct). Return STRICT JSON of this exact shape:\n` +
        `{ "realist":"", "liberal":"", "marxist":"", "constructivist":"" }`,
    });
  } catch (e) {
    return Response.json({ ok: false, error: "Openings generation failed.", detail: String(e.message) }, { status: 502 });
  }

  const openings = {
    realist: out && out.realist ? String(out.realist) : "",
    liberal: out && out.liberal ? String(out.liberal) : "",
    marxist: out && out.marxist ? String(out.marxist) : "",
    constructivist: out && out.constructivist ? String(out.constructivist) : "",
  };

  // Cache on the deep dive row (best-effort; still return on write failure).
  try {
    await query(
      `update public.seminar_deep_dive
          set debate_openings = $2::jsonb, debate_openings_at = now(), updated_at = now()
        where seminar_id = $1`,
      [seminarId, JSON.stringify(openings)]
    );
  } catch { /* non-fatal */ }

  return Response.json({ ok: true, openings: withMeta(openings), cached: false });
}
