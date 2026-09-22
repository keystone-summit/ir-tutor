// Guard tests for the two weekly WASTE defects fixed on 2026-09-21.
//
//   node scripts/test_waste_guards.mjs        (wired into `npm test`)
//
// Defect 1 — the Deep Dive ran twice every week. /api/seminar/generate
//   fire-and-forgets /api/seminar/deepen at 11:00 and the Vercel cron ran it
//   again at 11:30; the second run got no seminar_id, fell through to "latest
//   published" and re-did the same edition — a second Claude bill plus a
//   delete+insert over output that was already good. Fix: deepen is now
//   genuinely idempotent and the cron stays as the safety net.
//
// Defect 2 — the briefing audio could be paid for twice. voice-briefing
//   synthesises the briefing into seminar_briefing_audio; section-audio
//   ?section=briefing used to synthesise the byte-identical text into a
//   different table the first time anyone pressed play. Fix: the briefing
//   section reuses the stored MP3.
//
// Pure-function coverage plus source-level assertions, so nobody can quietly
// reintroduce either double-spend by deleting the check. No DB, no Claude, no
// ElevenLabs.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { shouldRunDeepDive } from "../lib/seminarDeepDiveGuard.js";
import { briefingReuseDecision, sectionNarration } from "../lib/seminarSectionVoice.js";
import { briefingNarration } from "../lib/seminarBriefingVoice.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// DEFECT 1 — no second deepen path may re-pay for an existing deep dive.
// ---------------------------------------------------------------------------

test("deepen SKIPS an edition that already has a deep dive", () => {
  const d = shouldRunDeepDive({ existing: { id: 7 }, force: false });
  assert.strictEqual(d.run, false, "a second trigger must not re-pay for existing output");
  assert.strictEqual(d.reason, "already_exists");
});

test("deepen RUNS when the edition has no deep dive yet", () => {
  assert.strictEqual(shouldRunDeepDive({ existing: null }).run, true);
  assert.strictEqual(shouldRunDeepDive({ existing: undefined }).run, true);
  assert.strictEqual(shouldRunDeepDive({}).run, true);
});

test("force=1 remains an explicit escape hatch for a deliberate re-write", () => {
  const d = shouldRunDeepDive({ existing: { id: 7 }, force: true });
  assert.strictEqual(d.run, true);
  assert.strictEqual(d.reason, "force");
});

test("the deepen route applies the guard BEFORE it calls Claude", () => {
  const src = read("app/api/seminar/deepen/route.js");
  assert.ok(src.includes("shouldRunDeepDive"), "deepen route no longer uses the idempotency guard");
  assert.ok(/from public\.seminar_deep_dive where seminar_id/.test(src),
    "deepen route no longer looks for an existing deep dive");
  const guardAt = src.indexOf("shouldRunDeepDive({");
  const claudeAt = src.indexOf("claudeJSON({");
  assert.ok(guardAt > 0 && claudeAt > 0, "expected both the guard call and the Claude call");
  assert.ok(guardAt < claudeAt, "the guard must run before the paid Claude call, not after");
});

test("the deepen cron stays in vercel.json as the safety net, exactly once", () => {
  // generate's chained trigger is a bare un-awaited fetch(...).catch(() => {})
  // that Vercel may freeze before it leaves, and it is skipped entirely with no
  // cron secret set — so the cron must remain. With deepen now idempotent the
  // cron costs nothing when the chain already worked.
  const cfg = JSON.parse(read("vercel.json"));
  const deepenCrons = cfg.crons.filter((c) => c.path === "/api/seminar/deepen");
  assert.strictEqual(deepenCrons.length, 1, "expected exactly one deepen cron entry");
  assert.strictEqual(deepenCrons[0].schedule, "30 11 * * 1");
});

test("generate still chains deepen, and still does not await it", () => {
  // Removing the chain would leave the deep dive an hour late on manual runs and
  // break the heartbeat self-heal; awaiting it would re-introduce the timeout
  // that split the two endpoints in the first place.
  const src = read("app/api/seminar/generate/route.js");
  assert.ok(/fetch\(`\$\{origin\}\/api\/seminar\/deepen\?seminar_id=/.test(src),
    "generate no longer chains deepen");
  assert.ok(!/await fetch\(`\$\{origin\}\/api\/seminar\/deepen/.test(src),
    "generate must not await deepen (60s function cap)");
});

// ---------------------------------------------------------------------------
// DEFECT 2 — the briefing section must not synthesise when stored audio exists.
// ---------------------------------------------------------------------------

const edition = { id: 42, title: "Week of June 22–28, 2026 — Straits and Signals" };
const events = [
  { id: 1, rank: 1, title: "Taiwan Strait transit", summary: "A carrier group transits.", reasoning: "It tests deterrence." },
  { id: 2, rank: 2, title: "OPEC+ holds output", summary: "Quotas unchanged.", reasoning: "Prices stay firm." },
];
const VOICE = "pNInz6obpgDQGcFmaJgB";
const MODEL = "eleven_multilingual_v2";
const mp3 = Buffer.alloc(4096, 1);

test("voice-briefing and the briefing section build the SAME text (so reuse is safe)", () => {
  // This is the whole premise of the fix: if these ever diverge, reuse would
  // change what John hears and the char_count check below stops being valid.
  const viaVoiceBriefing = briefingNarration(edition, events);
  const viaSection = sectionNarration("briefing", { edition, events });
  assert.strictEqual(viaSection, viaVoiceBriefing);
});

test("briefing section REUSES stored audio instead of synthesising", () => {
  const text = briefingNarration(edition, events);
  const stored = { mp3, char_count: text.length, voice_id: VOICE, model_id: MODEL };
  const d = briefingReuseDecision({ stored, text, voiceId: VOICE, modelId: MODEL });
  assert.strictEqual(d.reuse, true, "stored briefing audio exists — must not re-bill ElevenLabs");
  assert.strictEqual(d.reason, "stored_briefing_audio");
});

test("briefing section reuses rows written before the voice/model columns existed", () => {
  const text = briefingNarration(edition, events);
  const stored = { mp3, char_count: text.length, voice_id: null, model_id: null };
  assert.strictEqual(briefingReuseDecision({ stored, text, voiceId: VOICE, modelId: MODEL }).reuse, true);
});

test("briefing section SYNTHESISES when there is genuinely nothing stored", () => {
  const text = briefingNarration(edition, events);
  assert.strictEqual(briefingReuseDecision({ stored: null, text, voiceId: VOICE, modelId: MODEL }).reuse, false);
  assert.strictEqual(
    briefingReuseDecision({ stored: { mp3: Buffer.alloc(0), char_count: text.length }, text, voiceId: VOICE, modelId: MODEL }).reuse,
    false, "an empty mp3 column is not usable audio");
});

test("briefing section SYNTHESISES when the edition text changed", () => {
  // e.g. a deepen re-run or a re-ranked edition — the listener must never be
  // served audio of the old script.
  const text = briefingNarration(edition, events);
  const stored = { mp3, char_count: text.length + 120, voice_id: VOICE, model_id: MODEL };
  const d = briefingReuseDecision({ stored, text, voiceId: VOICE, modelId: MODEL });
  assert.strictEqual(d.reuse, false);
  assert.strictEqual(d.reason, "text_changed");
});

test("briefing section SYNTHESISES when the voice or model changed", () => {
  const text = briefingNarration(edition, events);
  const base = { mp3, char_count: text.length, voice_id: VOICE, model_id: MODEL };
  assert.strictEqual(
    briefingReuseDecision({ stored: base, text, voiceId: "someOtherVoice", modelId: MODEL }).reason,
    "voice_changed");
  assert.strictEqual(
    briefingReuseDecision({ stored: base, text, voiceId: VOICE, modelId: "eleven_turbo_v2" }).reason,
    "model_changed");
});

test("the section-audio route checks stored briefing audio before synthesising", () => {
  const src = read("app/api/seminar/section-audio/route.js");
  assert.ok(src.includes("briefingReuseDecision"), "section-audio no longer reuses the stored briefing MP3");
  assert.ok(/from public\.seminar_briefing_audio where seminar_id/.test(src),
    "section-audio no longer reads seminar_briefing_audio");
  const reuseAt = src.indexOf("briefingReuseDecision({");
  const synthAt = src.indexOf("synthesizeSection(text");
  assert.ok(reuseAt > 0 && synthAt > 0, "expected both the reuse check and the synthesis call");
  assert.ok(reuseAt < synthAt, "the reuse check must run before the paid synthesis call");
});

test("the reuse branch is scoped to the briefing section only", () => {
  // The other five sections must keep their own content-hash cache path.
  const src = read("app/api/seminar/section-audio/route.js");
  assert.ok(/if \(section === "briefing"\)/.test(src),
    "the stored-audio reuse must be gated on section === 'briefing'");
  for (const key of ["deep_dive", "gaps", "implications", "what_to_watch", "pattern_echoes"]) {
    const text = sectionNarration(key, {
      edition, events,
      deep_dive: {
        layers: { world_order: "The system shifts." },
        lenses: { realism: "Power balances." },
        gaps: { info: "We lack ground truth." },
        implications: { us_strategy: "US posture tightens." },
        what_to_watch: "- Second transit",
      },
      pattern_echoes: [{ event_id: 1, event_rank: 1, event_title: "Taiwan Strait transit", name: "Suez 1956", explanation: "Canal leverage." }],
    });
    assert.ok(text && text.trim(), `section ${key} must still build narration`);
    // And none of them may be mistaken for the briefing by the reuse helper.
    assert.strictEqual(
      briefingReuseDecision({ stored: { mp3, char_count: briefingNarration(edition, events).length, voice_id: VOICE, model_id: MODEL }, text, voiceId: VOICE, modelId: MODEL }).reuse,
      false, `section ${key} must never reuse the briefing MP3`);
  }
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) { console.error("WASTE GUARD TEST FAILED"); }
