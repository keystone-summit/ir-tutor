// GET /api/seminar/section-audio?id=<edition>&section=<key>
//   Streams the narration MP3 for ONE section of an edition, generating it on
//   first request and caching it in public.seminar_section_audio keyed by a
//   content hash. Later requests are served from the cache; if the section's
//   text changes (e.g. the Thursday deepen re-run), the hash no longer matches
//   and the audio is regenerated transparently.
//
//   Public (no PIN) — same posture as /briefing-audio and the static
//   theory/pattern MP3s, because the browser <audio> element streams it and
//   can't attach a bearer token. The reader page itself stays PIN-gated. The
//   spoken text is derived server-side from the DB, so nothing sensitive is
//   accepted from the client beyond an edition id and a section key.
//
//   Returns 404 when the section has no content this week or ELEVENLABS_API_KEY
//   is unset — the reader's audio control then quietly hides itself.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { query } from "../../../../lib/db";
import {
  sectionNarration,
  isValidSectionKey,
  contentHash,
  synthesizeSection,
  ensureSectionAudioTable,
  ADAM_VOICE_ID,
  BRIEFING_MODEL_ID,
} from "../../../../lib/seminarSectionVoice";

function notFound(msg = "not found") {
  return new Response(msg, { status: 404 });
}

// Load just enough of the edition to build any section's narration. Mirrors the
// defensive column handling in /api/seminar/current so a pre-migration DB still
// resolves the row.
async function loadBundle(idParam) {
  let edition;
  if (Number.isInteger(idParam)) {
    const r = await query(`select id, title, week_start_date, week_end_date from public.seminar_editions where id = $1`, [idParam]);
    edition = r.rows[0];
  } else {
    const r = await query(
      `select id, title, week_start_date, week_end_date from public.seminar_editions
        where status = 'published' order by week_start_date desc limit 1`, []);
    edition = r.rows[0];
  }
  if (!edition) return null;

  const ev = await query(
    `select id, rank, title, summary, reasoning from public.seminar_events
      where seminar_id = $1 order by rank asc`, [edition.id]);

  const dd = await query(
    `select layers, lenses, gaps, implications, what_to_watch
       from public.seminar_deep_dive where seminar_id = $1 limit 1`, [edition.id]);

  let echoes = [];
  try {
    const pe = await query(
      `select ev.id as event_id, ev.rank as event_rank, ev.title as event_title,
              pm.explanation, p.name
         from public.seminar_pattern_matches pm
         join public.seminar_events ev on ev.id = pm.seminar_event_id
         join public.seminar_historical_patterns p on p.id = pm.historical_pattern_id
        where ev.seminar_id = $1
        order by ev.rank asc, pm.match_strength desc`, [edition.id]);
    echoes = pe.rows;
  } catch { /* pattern tables may not exist yet — no echoes section */ }

  return { edition, events: ev.rows, deep_dive: dd.rows[0] || null, pattern_echoes: echoes };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id"), 10);
  const section = String(searchParams.get("section") || "").trim();

  if (!Number.isInteger(id)) return new Response("missing id", { status: 400 });
  if (!isValidSectionKey(section)) return new Response("bad section", { status: 400 });

  let bundle;
  try {
    bundle = await loadBundle(id);
  } catch {
    return new Response("db error", { status: 500 });
  }
  if (!bundle) return notFound("no edition");

  const text = sectionNarration(section, bundle);
  if (!text || !text.trim()) return notFound("section empty");

  const voiceId = process.env.ELEVENLABS_VOICE_ID || ADAM_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || BRIEFING_MODEL_ID;
  const hash = contentHash(text, voiceId, modelId);

  // Cache lookup — serve immediately when the stored hash still matches.
  let cached = null;
  try {
    const r = await query(
      `select mp3, content_hash from public.seminar_section_audio
        where seminar_id = $1 and section_key = $2 limit 1`, [id, section]);
    cached = r.rows[0] || null;
  } catch { /* table not created yet — fall through to generation */ }

  if (cached && cached.content_hash === hash && cached.mp3) {
    return streamMp3(cached.mp3);
  }

  // Cache miss (or stale) — synthesize now. Without a key, hide gracefully.
  if (!process.env.ELEVENLABS_API_KEY) return notFound("voice not configured");

  let buf;
  try {
    buf = await synthesizeSection(text, { voiceId, modelId });
  } catch {
    // If synthesis fails but we still hold a (stale) cached copy, serve it so
    // the reader isn't left with a dead control.
    if (cached && cached.mp3) return streamMp3(cached.mp3);
    return notFound("synth failed");
  }

  try {
    await ensureSectionAudioTable(query);
    await query(
      `insert into public.seminar_section_audio
         (seminar_id, section_key, content_hash, mp3, char_count, byte_size, voice_id, model_id, updated_at)
       values ($1, $2, $3, $4::bytea, $5, $6, $7, $8, now())
       on conflict (seminar_id, section_key) do update set
         content_hash = excluded.content_hash, mp3 = excluded.mp3,
         char_count = excluded.char_count, byte_size = excluded.byte_size,
         voice_id = excluded.voice_id, model_id = excluded.model_id, updated_at = now()`,
      [id, section, hash, buf, text.length, buf.length, voiceId, modelId]
    );
  } catch { /* cache write failed — still serve the freshly generated bytes */ }

  return streamMp3(buf);
}

function streamMp3(buf) {
  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(buf.length),
      // Short cache: content can change weekly, and the server re-derives the
      // hash from the DB on every request so a stale browser copy self-corrects.
      "cache-control": "public, max-age=3600",
      "accept-ranges": "bytes",
    },
  });
}
