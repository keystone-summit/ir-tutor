// POST /api/seminar/debate
//   PIN-gated. Body: { seminar_id, persona, messages:[{role,content},...], debate_id? }
//   Appends the user's latest turn (already included in `messages`), asks Claude
//   to respond AS the chosen persona grounded in this week's event, persists the
//   full thread to seminar_debates, and returns the persona's reply.
//
//   Response: { ok, reply, debate_id, persona }
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireAuth } from "../../../../lib/auth";
import { query, JOHN_USER_ID } from "../../../../lib/db";
import { claudeText } from "../../../../lib/anthropic";
import { getPersona, buildEventContext } from "../../../../lib/seminar_personas";

export async function POST(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad request." }, { status: 400 }); }

  const seminarId = parseInt(body && body.seminar_id, 10);
  const personaKey = body && body.persona;
  const debateId = body && body.debate_id ? parseInt(body.debate_id, 10) : null;
  const messages = Array.isArray(body && body.messages) ? body.messages : [];

  const persona = getPersona(personaKey);
  if (!Number.isInteger(seminarId) || !persona) {
    return Response.json({ ok: false, error: "seminar_id and a valid persona required." }, { status: 400 });
  }
  // Sanitize the incoming thread to alternating user/assistant text turns.
  const clean = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return Response.json({ ok: false, error: "Last message must be from the user." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  // Ground the persona in this week's event.
  let edition, event, dd;
  try {
    const er = await query(`select id, title from public.seminar_editions where id = $1 limit 1`, [seminarId]);
    edition = er.rows[0];
    if (!edition) return Response.json({ ok: false, error: "Edition not found." }, { status: 404 });
    const ev = await query(
      `select id, title, summary, reasoning from public.seminar_events where seminar_id = $1 and rank = 1 limit 1`,
      [seminarId]
    );
    event = ev.rows[0] || null;
    const ddr = await query(`select layers from public.seminar_deep_dive where seminar_id = $1 limit 1`, [seminarId]);
    dd = ddr.rows[0] || null;
  } catch (e) {
    return Response.json({ ok: false, error: "DB error.", detail: String(e.message) }, { status: 500 });
  }

  const ctx = buildEventContext({ edition, event, deepDive: dd });
  const system =
    persona.system +
    "\n\nYou are debating a student in a graduate IR seminar's Debate Room. " +
    "Stay rigorously in character for your school of thought. Engage the " +
    "student's specific counterargument directly — concede where they land a " +
    "real point, but defend your framework. Keep replies to 3-5 tight " +
    "paragraphs or fewer. Do not break character or mention being an AI.\n\n" +
    "THIS WEEK'S EVENT (the thing under debate):\n" + ctx;

  let reply;
  try {
    reply = await claudeText({ system, user: clean, maxTokens: 1400 });
  } catch (e) {
    return Response.json({ ok: false, error: "Debate response failed.", detail: String(e.message) }, { status: 502 });
  }

  const fullThread = clean.concat([{ role: "assistant", content: reply }]);

  // Persist: update existing thread or insert a new one.
  let savedId = debateId;
  try {
    if (Number.isInteger(debateId)) {
      const upd = await query(
        `update public.seminar_debates set messages = $2::jsonb, updated_at = now()
          where id = $1 and user_id = $3 and seminar_id = $4 returning id`,
        [debateId, JSON.stringify(fullThread), JOHN_USER_ID, seminarId]
      );
      savedId = upd.rows[0] ? upd.rows[0].id : null;
    }
    if (!Number.isInteger(savedId)) {
      const ins = await query(
        `insert into public.seminar_debates (user_id, seminar_id, persona, messages)
         values ($1, $2, $3, $4::jsonb) returning id`,
        [JOHN_USER_ID, seminarId, persona.key, JSON.stringify(fullThread)]
      );
      savedId = ins.rows[0].id;
    }
  } catch (e) {
    // Persistence failure shouldn't lose the reply — return it, flag the save.
    return Response.json({ ok: true, reply, persona: persona.key, debate_id: null, save_error: String(e.message) });
  }

  return Response.json({ ok: true, reply, persona: persona.key, debate_id: savedId });
}
