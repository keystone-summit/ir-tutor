// Generate ElevenLabs voice narration for the FP Seminar IR Theory Library
// (73 theories) and Library of Patterns (54 patterns) — one MP3 per item.
//
// Output: public/audio/seminar/theory_<slug>.mp3  and  pattern_<slug>.mp3
// The <slug> matches what the React components compute at runtime:
//   - theories: the seed `slug` field (already kebab-case)
//   - patterns: slugify(name)  (see slugifyPattern below + lib/seminarAudio.js)
//
// Idempotent: an existing, non-trivial MP3 is left alone so reruns only fill gaps.
// The API key is read from the env (ELEVENLABS_API_KEY) — never hardcode it here.
//
// Voice: ElevenLabs "Adam" (deep, measured — academic-but-accessible narrator).
// Model: eleven_multilingual_v2.  Settings: stability 0.5 / similarity 0.75 / speed 1.0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "audio", "seminar");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"; // Adam
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY not set in env. Aborting.");
  process.exit(1);
}

// Shared slug rule for patterns — keep in sync with lib/seminarAudio.js.
function slugifyPattern(name) {
  return String(name)
    .toLowerCase()
    .replace(/[–—]/g, "-") // en/em dash -> hyphen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function theoryNarration(t) {
  return [
    t.name + ".",
    t.definition,
    t.classic_thinker ? "Classic thinker: " + t.classic_thinker + "." : "",
    t.canonical_example ? "Canonical example: " + t.canonical_example : "",
    t.modern_echo ? "Modern echo: " + t.modern_echo : "",
  ].filter(Boolean).join(" ");
}

function patternNarration(p) {
  return [
    p.name + ".",
    p.description,
    p.what_happened ? "What happened: " + p.what_happened : "",
    p.outcome ? "Outcome: " + p.outcome : "",
    p.lessons ? "Lessons: " + p.lessons : "",
  ].filter(Boolean).join(" ");
}

const theoriesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "seminar_theory_seed.json"), "utf8"));
const patternsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "seminar_pattern_seed.json"), "utf8"));
const theories = theoriesRaw.theories || theoriesRaw;
const patterns = patternsRaw.patterns || patternsRaw;

const items = [
  ...theories.map((t) => ({ file: `theory_${t.slug}.mp3`, text: theoryNarration(t), label: t.name })),
  ...patterns.map((p) => ({ file: `pattern_${slugifyPattern(p.name)}.mp3`, text: patternNarration(p), label: p.name })),
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const MIN_VALID_BYTES = 1000; // anything smaller is a stub/error, regenerate it.

async function generate(text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "accept": "audio/mpeg",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_VALID_BYTES) throw new Error(`tiny payload (${buf.length} bytes)`);
  return buf;
}

let made = 0, skipped = 0, failed = 0, charsBurned = 0;
const failures = [];

for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const dest = path.join(OUT_DIR, it.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_VALID_BYTES) {
    skipped++;
    continue;
  }
  try {
    const buf = await generate(it.text);
    fs.writeFileSync(dest, buf);
    made++;
    charsBurned += it.text.length;
    console.log(`[${i + 1}/${items.length}] ${it.file}  (${it.text.length} chars, ${buf.length} bytes)`);
  } catch (e) {
    failed++;
    failures.push({ file: it.file, error: String(e.message || e) });
    console.error(`[${i + 1}/${items.length}] FAIL ${it.file}: ${e.message || e}`);
  }
}

console.log("\n==== SUMMARY ====");
console.log(`generated: ${made} | skipped(existing): ${skipped} | failed: ${failed}`);
console.log(`chars burned this run: ${charsBurned}`);
if (failures.length) {
  console.log("FAILURES:");
  failures.forEach((f) => console.log(`  ${f.file}: ${f.error}`));
  process.exit(2);
}
