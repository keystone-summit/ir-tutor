// Guard test for the whole-page / per-section seminar narration logic.
//
//   node scripts/test_section_audio.mjs        (also wired as `npm test`)
//
// Pure-function coverage only — no DB, no ElevenLabs. Verifies:
//   - presentSections mirrors the reader's section-render guards
//   - each section's narration text is built (and empty when absent)
//   - content hashing is deterministic and text-sensitive
//   - long narration chunks under the request limit and loses no content
//   - section-key validation
import assert from "node:assert";
import { presentSections, SECTION_KEYS } from "../lib/seminarSections.js";
import {
  sectionNarration, isValidSectionKey, contentHash, chunkForSynthesis,
} from "../lib/seminarSectionVoice.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// A representative fully-populated edition bundle.
const fullBundle = {
  edition: { id: 42, title: "Week of June 22–28, 2026 — Straits and Signals" },
  events: [
    { id: 1, rank: 1, title: "Taiwan Strait transit", summary: "A carrier group transits.", reasoning: "It tests deterrence." },
    { id: 2, rank: 2, title: "OPEC+ holds output", summary: "Quotas unchanged.", reasoning: "Prices stay firm." },
  ],
  deep_dive: {
    layers: { world_order: "The system shifts.", regional: "The region reacts.", bilateral: "", domestic: "Politics at home bite.", actor: "" },
    lenses: { realism: "Power balances.", liberalism: "", constructivism: "Norms contested.", marxist: "", game_theory: "Signalling game." },
    gaps: { info: "We lack ground truth.", source_bias: "", counterfactual: "What if they held back.", osint: "", counter_intel: "" },
    implications: { us_strategy: "US posture tightens.", us_business: "", us_households: "Fuel costs edge up." },
    what_to_watch: "- Second transit\n- OPEC+ side deals\n",
  },
  pattern_echoes: [
    { event_id: 1, event_rank: 1, event_title: "Taiwan Strait transit", name: "Cuban Missile brinkmanship", explanation: "Signalling under nuclear shadow." },
    { event_id: 2, event_rank: 2, event_title: "OPEC+ holds output", name: "1973 embargo", explanation: "Producers wield supply." },
  ],
};

test("presentSections returns all six when fully populated", () => {
  const keys = presentSections(fullBundle).map((s) => s.key);
  assert.deepStrictEqual(keys, ["briefing", "deep_dive", "gaps", "implications", "what_to_watch", "pattern_echoes"]);
});

test("presentSections drops empty sections", () => {
  const bundle = { edition: fullBundle.edition, events: fullBundle.events, deep_dive: null, pattern_echoes: [] };
  const keys = presentSections(bundle).map((s) => s.key);
  assert.deepStrictEqual(keys, ["briefing"]); // only the briefing survives with no deep dive / echoes
});

test("presentSections is empty with no events, deep dive, or echoes", () => {
  assert.strictEqual(presentSections({ events: [], deep_dive: null, pattern_echoes: [] }).length, 0);
});

test("every present section builds non-empty narration", () => {
  for (const key of SECTION_KEYS) {
    const text = sectionNarration(key, fullBundle);
    assert.ok(text && text.trim().length > 0, `expected narration for ${key}`);
  }
});

test("absent section builds empty narration", () => {
  const noGaps = { ...fullBundle, deep_dive: { ...fullBundle.deep_dive, gaps: {} } };
  assert.strictEqual(sectionNarration("gaps", noGaps).trim(), "");
});

test("briefing narration names the lead events", () => {
  const t = sectionNarration("briefing", fullBundle);
  assert.ok(t.includes("Taiwan Strait transit"));
  assert.ok(/top five events/i.test(t));
});

test("deep dive narration spells US as United States and skips blank layers", () => {
  const t = sectionNarration("implications", fullBundle);
  assert.ok(t.includes("United States strategy"));
  assert.ok(!/\bUS strategy\b/.test(t)); // acronym expanded
  assert.ok(!t.includes("United States business")); // us_business was blank -> omitted
});

test("what to watch turns bullets into sentences", () => {
  const t = sectionNarration("what_to_watch", fullBundle);
  assert.ok(t.includes("Second transit."));
  assert.ok(!t.includes("- Second")); // bullet marker stripped
});

test("pattern echoes narration references the matched pattern", () => {
  const t = sectionNarration("pattern_echoes", fullBundle);
  assert.ok(t.includes("Cuban Missile brinkmanship"));
  assert.ok(/rhymes with the past/i.test(t));
});

test("contentHash is deterministic and text-sensitive", () => {
  const a = contentHash("hello world", "v1", "m1");
  const b = contentHash("hello world", "v1", "m1");
  const c = contentHash("hello worlds", "v1", "m1");
  const d = contentHash("hello world", "v2", "m1");
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c); // text change busts
  assert.notStrictEqual(a, d); // voice change busts
});

test("chunkForSynthesis keeps short text as one chunk", () => {
  const chunks = chunkForSynthesis("short paragraph", 3500);
  assert.strictEqual(chunks.length, 1);
});

test("chunkForSynthesis splits long text under the limit and preserves content", () => {
  const para = "This is a sentence that repeats. ".repeat(60); // ~2000 chars
  const text = [para, para, para].join("\n\n");             // ~6000 chars, 3 paras
  const chunks = chunkForSynthesis(text, 3500);
  assert.ok(chunks.length >= 2, "expected multiple chunks");
  chunks.forEach((c) => assert.ok(c.length <= 3500, "chunk over limit"));
  // No words dropped: joined chunk word count matches the source.
  const words = (s) => s.replace(/\s+/g, " ").trim().split(" ").length;
  assert.strictEqual(words(chunks.join(" ")), words(text));
});

test("isValidSectionKey accepts known keys, rejects junk", () => {
  assert.ok(isValidSectionKey("deep_dive"));
  assert.ok(!isValidSectionKey("debate"));
  assert.ok(!isValidSectionKey(""));
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) { console.error("SECTION AUDIO GUARD TEST FAILED"); }
