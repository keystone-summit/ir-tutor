// Generate ElevenLabs voice narration for the FP Seminar and the IR Tutor course.
//
// THREE content sets, selected by a mode argument (default: all three):
//   theories  -> public/audio/seminar/theory_<slug>.mp3   (73 brief theory blurbs)
//   patterns  -> public/audio/seminar/pattern_<slug>.mp3  (54 brief pattern blurbs)
//   lectures  -> public/audio/seminar/lecture_<n>.mp3      (14 FULL course lectures)
//
// The <slug>/<n> matches what the React components compute at runtime:
//   - theories: the seed `slug` field (already kebab-case)
//   - patterns: slugify(name)  (see slugifyPattern below + lib/seminarAudio.js)
//   - lectures: the week number 1..14 (see lectureAudioUrl in lib/seminarAudio.js)
//
// Usage:
//   node scripts/generate_seminar_audio.mjs                 # all three sets
//   node scripts/generate_seminar_audio.mjs lectures        # just the 14 lectures
//   node scripts/generate_seminar_audio.mjs lectures 1      # just lecture 1 (test)
//   node scripts/generate_seminar_audio.mjs theories patterns
//
// Idempotent: an existing, non-trivial MP3 is left alone so reruns only fill gaps.
// Pass FORCE=1 in the env to regenerate even when a file already exists.
// The API key is read from the env (ELEVENLABS_API_KEY) — never hardcode it here.
//
// Voice: ElevenLabs "Adam" (deep, measured — academic-but-accessible narrator).
// Model: eleven_multilingual_v2.  Settings: stability 0.5 / similarity 0.75 / speed 1.0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WEEKS } from "../components/course.js";
import { lectureNarration } from "../lib/seminarLectureVoice.js";

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

// ---- mode selection --------------------------------------------------------
// Positional args pick which sets to build; a bare number after "lectures"
// narrows to a single week (used to test one lecture before the full batch).
const argv = process.argv.slice(2);
const modeWords = argv.filter((a) => /^(theories|patterns|lectures)$/.test(a));
const onlyWeek = argv.map(Number).find((x) => Number.isInteger(x) && x >= 1 && x <= 14);
const wants = (m) => (modeWords.length === 0 ? true : modeWords.includes(m));
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";

const items = [];

if (wants("theories")) {
  const theoriesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "seminar_theory_seed.json"), "utf8"));
  const theories = theoriesRaw.theories || theoriesRaw;
  items.push(...theories.map((t) => ({ file: `theory_${t.slug}.mp3`, text: theoryNarration(t), label: t.name })));
}
if (wants("patterns")) {
  const patternsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "seminar_pattern_seed.json"), "utf8"));
  const patterns = patternsRaw.patterns || patternsRaw;
  items.push(...patterns.map((p) => ({ file: `pattern_${slugifyPattern(p.name)}.mp3`, text: patternNarration(p), label: p.name })));
}
if (wants("lectures")) {
  const weeks = onlyWeek ? WEEKS.filter((w) => w.n === onlyWeek) : WEEKS;
  items.push(...weeks.map((w) => ({
    file: `lecture_${w.n}.mp3`,
    text: lectureNarration(w),
    label: `Week ${w.n}: ${String(w.title).split("·")[0].trim()}`,
  })));
}

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
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size >= MIN_VALID_BYTES) {
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
