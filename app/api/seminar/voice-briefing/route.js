// POST/GET /api/seminar/voice-briefing[?id=<n>][&force=1]
//   Generates the Weekly Briefing voice narration for one edition and stores the
//   MP3 in public.seminar_briefing_audio (streamed back by /briefing-audio).
//
//   Runs three ways:
//     1. Vercel Cron (Monday 13:30 UTC) — last step of the weekly chain, after
//        match-patterns (13:00). Voices the freshest published edition.
//     2. On-demand back-fill — ?id=<n> targets a specific edition.
//     3. Re-voice — &force=1 regenerates even if audio already exists.
//
//   Idempotent: skips an edition that's already voiced unless force=1, so the
//   weekly cron only spends ElevenLabs credits on genuinely new editions.
//   Gated by SEMINAR_CRON_SECRET / CRON_SECRET (cron) OR a PIN token.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { requireCronOrAuth } from "../../../../lib/seminarAuth";
import { query } from "../../../../lib/db";
import {
  briefingNarration,
  synthesizeBriefing,
  ensureBriefingAudioTable,
  ADAM_VOICE_ID,
  BRIEFING_MODEL_ID,
} from "../../../../lib/seminarBriefingVoice";

async function pickEdition(seminarId) {
  if (Number.isInteger(seminarId)) {
    const r = await query(
      `select id, title from public.seminar_editions where id = $1 limit 1`, [seminarId]);
    return r.rows[0] || null;
  }
  const r = await query(
    `select id, title from public.seminar_editions
      where status = 'published' order by week_start_date desc limit 1`, []);
  return r.rows[0] || null;
}

export async function POST(req) {
  const auth = requireCronOrAuth(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const seminarId = parseInt(searchParams.get("id") || searchParams.get("seminar_id"), 10);
  const force = searchParams.get("force") === "1";

  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json({ ok: false, error: "ELEVENLABS_API_KEY not set in environment." }, { status: 500 });
  }

  const edition = await pickEdition(seminarId);
  if (!edition) return Response.json({ ok: false, error: "No edition to voice." }, { status: 404 });

  try {
    await ensureBriefingAudioTable(query);
  } catch (e) {
    return Response.json({ ok: false, error: "Audio table init failed.", detail: String(e.message) }, { status: 500 });
  }

  if (!force) {
    const ex = await query(
      `select byte_size from public.seminar_briefing_audio where seminar_id = $1`, [edition.id]);
    if (ex.rows.length) {
      return Response.json({ ok: true, edition_id: edition.id, skipped: true, reason: "already voiced", byte_size: ex.rows[0].byte_size });
    }
  }

  const ev = await query(
    `select rank, title, summary, reasoning from public.seminar_events
      where seminar_id = $1 order by rank asc`, [edition.id]);
  if (!ev.rows.length) {
    return Response.json({ ok: false, error: "Edition has no events.", edition_id: edition.id }, { status: 409 });
  }

  const text = briefingNarration(edition, ev.rows);

  let buf;
  try {
    buf = await synthesizeBriefing(text);
  } catch (e) {
    return Response.json({ ok: false, error: "Voice synth failed.", detail: String(e.message), edition_id: edition.id }, { status: 502 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || ADAM_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || BRIEFING_MODEL_ID;
  try {
    await query(
      `insert into public.seminar_briefing_audio (seminar_id, mp3, char_count, byte_size, voice_id, model_id)
       values ($1, $2::bytea, $3, $4, $5, $6)
       on conflict (seminar_id) do update set
         mp3 = excluded.mp3, char_count = excluded.char_count, byte_size = excluded.byte_size,
         voice_id = excluded.voice_id, model_id = excluded.model_id, created_at = now()`,
      [edition.id, buf, text.length, buf.length, voiceId, modelId]
    );
  } catch (e) {
    return Response.json({ ok: false, error: "Audio write failed.", detail: String(e.message), edition_id: edition.id }, { status: 500 });
  }

  return Response.json({ ok: true, edition_id: edition.id, char_count: text.length, byte_size: buf.length });
}

// Vercel Cron issues GET requests.
export const GET = POST;
