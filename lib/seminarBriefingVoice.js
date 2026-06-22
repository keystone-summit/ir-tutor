// Shared helpers for the per-edition Weekly Briefing voice narration.
//
// One combined MP3 per edition: the edition headline plus the week's top-five
// events (each with its summary and "why it matters"). Used by:
//   - /api/seminar/voice-briefing   (weekly cron + on-demand, stores to DB)
//   - scripts/generate_briefing_audio.mjs (local one-shot for a back-fill)
//
// Voice config matches the theory/pattern narration: ElevenLabs "Adam",
// eleven_multilingual_v2, stability 0.5 / similarity 0.75 / speed 1.0.

export const ADAM_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
export const BRIEFING_MODEL_ID = "eleven_multilingual_v2";
const MIN_VALID_BYTES = 1000; // anything smaller is an error payload, not audio.

// Build the spoken script for one edition. Plain language — it reads like a
// short radio briefing, no jargon framing. The "Week of YYYY-MM-DD —" prefix
// baked into the stored title is stripped so it isn't read aloud awkwardly.
export function briefingNarration(edition, events) {
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

// Synthesise narration text to an MP3 Buffer via the ElevenLabs API.
export async function synthesizeBriefing(text, opts = {}) {
  const apiKey = opts.apiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  const voiceId = opts.voiceId || process.env.ELEVENLABS_VOICE_ID || ADAM_VOICE_ID;
  const modelId = opts.modelId || process.env.ELEVENLABS_MODEL_ID || BRIEFING_MODEL_ID;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      accept: "audio/mpeg",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_VALID_BYTES) throw new Error(`tiny payload (${buf.length} bytes)`);
  return buf;
}

// Create the audio store on first use. Vercel cron functions run on a read-only
// filesystem, so generated MP3s can't be written into public/ and committed at
// run time — they live in Postgres and are streamed by /api/seminar/briefing-audio.
export async function ensureBriefingAudioTable(query) {
  await query(
    `create table if not exists public.seminar_briefing_audio (
       seminar_id integer primary key references public.seminar_editions(id) on delete cascade,
       mp3        bytea   not null,
       char_count integer,
       byte_size  integer,
       voice_id   text,
       model_id   text,
       created_at timestamptz not null default now()
     )`,
    []
  );
}
