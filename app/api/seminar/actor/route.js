// GET /api/seminar/actor?seminar_id=<n>&name=<actor name>
//   PIN-gated. Returns the 5-panel party click-in card for one named actor,
//   grounded in the given edition's Deep Dive. Lazy generation with a 7-day
//   cache: if the actor's card was generated in the last 7 days it is reused;
//   otherwise one Claude call (re)builds all 5 panels and caches them on the
//   seminar_actors row. This is the serverless-correct equivalent of the
//   "Monday-publish pre-warm" — first click pays, every later reader is cached.
//
//   Response: { ok, actor:{ name, type, card:{ trajectory, current_position_decoded,
//               action_upside, inaction_upside, faction_submap }, cached, last_generated_at } }
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { claudeJSON } from "../../../../lib/anthropic";

const CACHE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const CARD_SYSTEM =
  "You are a senior foreign-policy analyst writing an actor dossier for a " +
  "weekly US foreign-policy seminar. You decode what an actor is REALLY doing " +
  "beneath public statements, mapped against their historical pattern. Be " +
  "specific, name real factions and real interests, and stay grounded in the " +
  "provided event context. Return STRICT JSON only, no prose outside JSON.";

function cardFromRow(row) {
  return {
    trajectory: row.trajectory || [],
    current_position_decoded: row.current_position_decoded || "",
    action_upside: row.action_upside || [],
    inaction_upside: row.inaction_upside || [],
    faction_submap: row.faction_submap || [],
  };
}

export async function GET(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const seminarId = parseInt(searchParams.get("seminar_id"), 10);
  const name = (searchParams.get("name") || "").trim();
  if (!name) return Response.json({ ok: false, error: "name required." }, { status: 400 });

  // 1) Find (or create) the actor row.
  let actor;
  try {
    const r = await query(
      `select id, name, type, trajectory, current_position_decoded, action_upside,
              inaction_upside, faction_submap, last_generated_at
         from public.seminar_actors where lower(name) = lower($1) limit 1`,
      [name]
    );
    actor = r.rows[0];
    if (!actor) {
      const ins = await query(
        `insert into public.seminar_actors (name, type) values ($1, 'org')
         on conflict (lower(name)) do update set updated_at = now()
         returning id, name, type, trajectory, current_position_decoded, action_upside,
                   inaction_upside, faction_submap, last_generated_at`,
        [name.slice(0, 200)]
      );
      actor = ins.rows[0];
    }
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }

  // 2) Serve from cache if fresh (<7 days).
  const last = actor.last_generated_at ? Date.parse(actor.last_generated_at) : 0;
  if (last && Date.now() - last < CACHE_MS && actor.current_position_decoded) {
    return Response.json({
      ok: true,
      actor: { name: actor.name, type: actor.type, card: cardFromRow(actor), cached: true, last_generated_at: actor.last_generated_at },
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  // 3) Load event context to ground "current position decoded".
  let ctx = "";
  try {
    if (Number.isInteger(seminarId)) {
      const er = await query(
        `select e.title as edition_title, ev.title as event_title, ev.summary, ev.reasoning,
                dd.layers
           from public.seminar_editions e
           left join public.seminar_events ev on ev.seminar_id = e.id and ev.rank = 1
           left join public.seminar_deep_dive dd on dd.seminar_id = e.id
          where e.id = $1 limit 1`,
        [seminarId]
      );
      const row = er.rows[0];
      if (row) {
        const layers = row.layers || {};
        ctx =
          `SEMINAR: ${row.edition_title || ""}\n` +
          `THIS WEEK'S #1 EVENT: ${row.event_title || ""}\n` +
          `EVENT SUMMARY: ${row.summary || ""}\n` +
          `WHY IT MATTERS: ${row.reasoning || ""}\n` +
          `REGIONAL LAYER: ${(layers.regional || "").slice(0, 600)}\n` +
          `DOMESTIC LAYER: ${(layers.domestic || "").slice(0, 600)}`;
      }
    }
  } catch { /* context is best-effort */ }

  // 4) Generate the 5-panel card.
  let card;
  try {
    card = await claudeJSON({
      system: CARD_SYSTEM,
      maxTokens: 4000,
      user:
        `Build the actor dossier for: "${actor.name}" (type: ${actor.type}).\n\n` +
        `EVENT CONTEXT (the action currently under discussion this week):\n${ctx || "(general standing posture — no specific event context available)"}\n\n` +
        `Produce all five panels as STRICT JSON of this exact shape:\n` +
        `{\n` +
        `  "trajectory": [{"date":"<year or YYYY-MM>","label":"<short inflection point>","desc":"<one line>"}],\n` +
        `  "current_position_decoded": "<3-5 sentences: what their CURRENT public stance signals, decoded against their historical pattern>",\n` +
        `  "action_upside": ["<concrete thing they gain IF they take the action under discussion>", "..."],\n` +
        `  "inaction_upside": ["<concrete thing they gain IF they do NOT act / delay>", "..."],\n` +
        `  "faction_submap": [{"name":"<sub-faction / power center>","wants":"<what that faction wants>","serves_today":"yes|no|mixed"}]\n` +
        `}\n\n` +
        `Rules:\n` +
        `- trajectory: 5-8 chronological inflection points specific to THIS actor.\n` +
        `- action_upside / inaction_upside: 3-5 concrete bullets each (sanctions relief, oil revenue, leverage retention, deterrence signalling, etc.).\n` +
        `- faction_submap: 4-7 rows. If the actor is a state, break it into its real internal power centers (e.g. Iran = Khamenei's office, IRGC, reformists, technocrats, judiciary, Bonyad foundations; Israel = Likud, Otzma, IDF brass, Shin Bet, settler bloc, Haredi; US = Trump, restrainer wing, hawk wing, AIPAC, Quincy, FDD; China = CCP Politburo, PLA, state energy, tech sector). If the actor is an individual, firm, or armed group, map the stakeholders/power centers most relevant to its behaviour. "serves_today" = does today's public position serve that faction.`,
    });
  } catch (e) {
    // If generation fails but we have a stale-but-usable card, serve it.
    if (actor.current_position_decoded) {
      return Response.json({
        ok: true,
        actor: { name: actor.name, type: actor.type, card: cardFromRow(actor), cached: true, stale: true, last_generated_at: actor.last_generated_at },
      });
    }
    return Response.json({ ok: false, error: "Card generation failed.", detail: String(e.message) }, { status: 502 });
  }

  const trajectory = Array.isArray(card && card.trajectory) ? card.trajectory : [];
  const decoded = card && card.current_position_decoded ? String(card.current_position_decoded) : "";
  const actionUp = Array.isArray(card && card.action_upside) ? card.action_upside.map(String) : [];
  const inactionUp = Array.isArray(card && card.inaction_upside) ? card.inaction_upside.map(String) : [];
  const submap = Array.isArray(card && card.faction_submap) ? card.faction_submap : [];

  // 5) Cache on the actor row.
  try {
    await query(
      `update public.seminar_actors
          set trajectory = $2::jsonb, current_position_decoded = $3,
              action_upside = $4::jsonb, inaction_upside = $5::jsonb,
              faction_submap = $6::jsonb, last_generated_at = now(), updated_at = now()
        where id = $1`,
      [
        actor.id,
        JSON.stringify(trajectory),
        decoded,
        JSON.stringify(actionUp),
        JSON.stringify(inactionUp),
        JSON.stringify(submap),
      ]
    );
  } catch (e) {
    return Response.json({ ok: false, error: "Card write failed.", detail: String(e.message) }, { status: 500 });
  }

  return Response.json({
    ok: true,
    actor: {
      name: actor.name,
      type: actor.type,
      card: {
        trajectory,
        current_position_decoded: decoded,
        action_upside: actionUp,
        inaction_upside: inactionUp,
        faction_submap: submap,
      },
      cached: false,
      last_generated_at: new Date().toISOString(),
    },
  });
}
