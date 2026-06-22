// Generate the Weekly Briefing voice narration for one seminar edition and
// back-fill it into BOTH the DB (public.seminar_briefing_audio, the source the
// reader streams from) AND a committed static artifact under
// public/audio/briefings/edition_<id>.mp3.
//
// The weekly cron (/api/seminar/voice-briefing) handles new editions going
// forward; this one-shot exists to voice editions that pre-date the feature
// (e.g. edition 8) from a workstation that has the credentials.
//
// Narration text + voice settings are kept identical to
// lib/seminarBriefingVoice.js (self-contained here because this is an ESM .mjs
// in a CommonJS package and can't import that lib directly).
//
//   Env required: SUPABASE_DB_URL, ELEVENLABS_API_KEY
//   Usage: node scripts/generate_briefing_audio.mjs [editionId]   (default: latest published)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "audio", "briefings");

// Pull SUPABASE_DB_URL from the environment, falling back to .env.local.
function envOrDotenv(key) {
  if (process.env[key]) return process.env[key];
  try {
    const txt = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && line.slice(0, i).trim() === key) {
        return line.slice(i + 1).trim().replace(/^"|"$/g, "");
      }
    }
  } catch { /* no .env.local */ }
  return null;
}

const DB_URL = envOrDotenv("SUPABASE_DB_URL");
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"; // Adam
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const CREDITS_REMAINING = parseInt(process.env.ELEVENLABS_CREDITS_REMAINING || "78000", 10);

if (!DB_URL) { console.error("SUPABASE_DB_URL not set."); process.exit(1); }
if (!API_KEY) { console.error("ELEVENLABS_API_KEY not set."); process.exit(1); }

// --- narration builder (keep in sync with lib/seminarBriefingVoice.js) ---
function briefingNarration(edition, events) {
  const rawTitle = String((edition && edition.title) || "").trim();
  const title = rawTitle.replace(/^Week of\s+\d{4}-\d{2}-\d{2}\s*[—–-]\s*/i, "").trim();
  const ordinals = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
  const ev = (events || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const parts = [];
  parts.push("This week's Foreign Policy Implications Briefing.");
  if (title) parts.push(title + ".");
  parts.push("Here are the week's top five events.");
  ev.forEach((e, i) => {
    const seg = [`Number ${ordinals[i] || String(i + 1)}: ${String(e.title || "").trim()}.`];
    if (e.summary) seg.push(String(e.summary).trim());
    if (e.reasoning) seg.push("Why it matters: " + String(e.reasoning).trim());
    parts.push(seg.join(" "));
  });
  parts.push("That's your briefing for the week. Open the seminar to go deeper.");
  return parts.join("\n\n");
}

async function synthesize(text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, accept: "audio/mpeg", "content-type": "application/json" },
    body: JSON.stringify({
      text, model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`tiny payload (${buf.length} bytes)`);
  return buf;
}

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 2 });

async function main() {
  const idArg = parseInt(process.argv[2], 10);

  await pool.query(
    `create table if not exists public.seminar_briefing_audio (
       seminar_id integer primary key references public.seminar_editions(id) on delete cascade,
       mp3 bytea not null, char_count integer, byte_size integer,
       voice_id text, model_id text, created_at timestamptz not null default now())`
  );

  const edRes = Number.isInteger(idArg)
    ? await pool.query(`select id, title from public.seminar_editions where id = $1`, [idArg])
    : await pool.query(`select id, title from public.seminar_editions where status='published' order by week_start_date desc limit 1`);
  const edition = edRes.rows[0];
  if (!edition) { console.error("No edition found."); process.exit(2); }

  const ev = await pool.query(
    `select rank, title, summary, reasoning from public.seminar_events where seminar_id=$1 order by rank asc`,
    [edition.id]
  );
  if (!ev.rows.length) { console.error(`Edition ${edition.id} has no events.`); process.exit(3); }

  const text = briefingNarration(edition, ev.rows);
  console.log(`Edition ${edition.id}: "${edition.title}"`);
  console.log(`Narration: ${text.length} chars across ${ev.rows.length} events.`);

  const buf = await synthesize(text);
  console.log(`MP3: ${buf.length} bytes.`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, `edition_${edition.id}.mp3`);
  fs.writeFileSync(dest, buf);
  console.log(`Wrote static artifact: ${dest}`);

  await pool.query(
    `insert into public.seminar_briefing_audio (seminar_id, mp3, char_count, byte_size, voice_id, model_id)
     values ($1, $2::bytea, $3, $4, $5, $6)
     on conflict (seminar_id) do update set
       mp3=excluded.mp3, char_count=excluded.char_count, byte_size=excluded.byte_size,
       voice_id=excluded.voice_id, model_id=excluded.model_id, created_at=now()`,
    [edition.id, buf, text.length, buf.length, VOICE_ID, MODEL_ID]
  );
  console.log(`Stored in DB: public.seminar_briefing_audio (seminar_id=${edition.id}).`);

  // Budget projection.
  const perEdition = text.length;
  const editionsLeft = Math.floor(CREDITS_REMAINING / perEdition);
  console.log("\n==== BUDGET PROJECTION ====");
  console.log(`Chars this edition: ${perEdition}`);
  console.log(`Credits remaining (1 char ≈ 1 credit): ${CREDITS_REMAINING}`);
  console.log(`Editions coverable at this size: ~${editionsLeft} (≈ ${(editionsLeft / 52).toFixed(1)} years weekly)`);

  await pool.end();
}

main().catch((e) => { console.error("FAILED:", e.message); pool.end(); process.exit(9); });
