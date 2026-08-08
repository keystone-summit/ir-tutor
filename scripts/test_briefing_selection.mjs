// Guard test for the 15-event Weekly Briefing selection.
//
//   node scripts/test_briefing_selection.mjs
//
// Pure-function coverage only — no DB, no Anthropic. Verifies:
//   - the bucket quota is internally consistent (floors + open slots == target)
//   - the reader and the generator agree on the bucket list
//   - near-duplicate titles from different desks collapse, and genuinely
//     distinct-but-similar events do not
//   - the briefing narration scales past five events
import assert from "node:assert";
import {
  SEMINAR_EVENT_TARGET, REGION_BUCKETS, REGION_BUCKET_KEYS, REGION_BUCKET_LABEL,
  BUCKET_DESC, SELECTION_GROUPS, OPEN_SLOTS,
} from "../lib/seminarBuckets.js";
import { titleTokens, isDuplicateTitle, mergeDeskPicks } from "../lib/seminarSelection.js";
import { briefingNarration } from "../lib/seminarBriefingVoice.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// Helper mirroring how generate/route.js walks desks in order.
function dedupe(titles) {
  const seen = [];
  const kept = [];
  for (const t of titles) {
    const tok = titleTokens(t);
    if (isDuplicateTitle(tok, seen)) continue;
    seen.push(tok);
    kept.push(t);
  }
  return kept;
}

test("the briefing target is 15", () => {
  assert.strictEqual(SEMINAR_EVENT_TARGET, 15);
});

test("desk floors plus open slots exactly fill the target", () => {
  const floors = SELECTION_GROUPS.reduce((n, g) => n + g.floor, 0);
  assert.strictEqual(floors + OPEN_SLOTS, SEMINAR_EVENT_TARGET);
  assert.ok(OPEN_SLOTS >= 0, "floors overcommit the briefing");
});

test("every desk asks for more than its floor, so de-dup has spares", () => {
  for (const g of SELECTION_GROUPS) {
    assert.ok(g.ask > g.floor, `desk ${g.key} asks ${g.ask} with floor ${g.floor}`);
  }
});

test("desks together can supply the whole target", () => {
  const capacity = SELECTION_GROUPS.reduce((n, g) => n + g.ask, 0);
  assert.ok(capacity >= SEMINAR_EVENT_TARGET, `capacity ${capacity} < target ${SEMINAR_EVENT_TARGET}`);
});

test("desk buckets are disjoint and cover every declared bucket exactly once", () => {
  const all = SELECTION_GROUPS.flatMap((g) => g.buckets);
  assert.strictEqual(new Set(all).size, all.length, "a bucket is claimed by two desks");
  assert.deepStrictEqual([...all].sort(), [...REGION_BUCKET_KEYS].sort());
});

test("every bucket has a reader label and a selector description", () => {
  for (const k of REGION_BUCKET_KEYS) {
    assert.ok(REGION_BUCKET_LABEL[k], `no label for ${k}`);
    assert.ok(BUCKET_DESC[k], `no prompt description for ${k}`);
  }
  assert.strictEqual(REGION_BUCKETS.length, 8);
});

test("de-dup collapses the same story titled differently by two desks", () => {
  // Both of these shipped together on the first 15-event run.
  const kept = dedupe([
    "Saudi Arabia, Turkey, and Pakistan Sign Mecca Joint Defense Pact",
    "Saudi Arabia, Turkey, and Pakistan Sign Makkah Joint Defense Pact",
  ]);
  assert.strictEqual(kept.length, 1);
});

test("de-dup collapses Russia/Russian singular-plural variants of one vote", () => {
  // Both of these shipped together on the second run, before stemming.
  const kept = dedupe([
    "US Senate Passes Russia Sanctions and Iran Sanctions Expansion",
    "US Senate Passes Sweeping Sanctions Package Targeting Russian Energy",
  ]);
  assert.strictEqual(kept.length, 1);
});

test("de-dup collapses the exact Senate-sanctions pair that shipped on run 3", () => {
  // Verbatim titles from the Aug 3-9 run: one vote, written up by the
  // Europe/Russia desk and the BRICS-trade desk. 4 shared tokens of 7 each.
  const kept = dedupe([
    "US Senate Passes Russia Sanctions Bill with Iran Sanctions Expansion",
    "US Senate Passes Sweeping Russia Energy Sanctions Package",
  ]);
  assert.strictEqual(kept.length, 1);
});

test("de-dup keeps genuinely distinct events that share wording", () => {
  const kept = dedupe([
    "Russian Strikes Kill Four in Kyiv, Including a Child",
    "Russian Strikes Kill Ten in Kharkiv Overnight",
  ]);
  assert.strictEqual(kept.length, 2);
});

test("de-dup keeps two distinct Hormuz stories apart", () => {
  const kept = dedupe([
    "Iran Issues Conditions to Reopen Strait of Hormuz",
    "UAE Reports Iran Targeted ADNOC Tanker in Strait of Hormuz",
  ]);
  assert.strictEqual(kept.length, 2);
});

test("de-dup leaves a full slate of unrelated events untouched", () => {
  const titles = [
    "Iran Issues Conditions to Reopen Strait of Hormuz",
    "China's Military Deploys AI for Strike Operation Planning",
    "Trump Administration Fast-Tracks Military Partnership With Colombia",
    "AES Junta States Condemn ECOWAS Over Sahel Security",
    "China Reordering Global Governance From Within International Institutions",
  ];
  assert.strictEqual(dedupe(titles).length, titles.length);
});

// --- desk merge -----------------------------------------------------------

// Build a desk whose picks are all in one bucket except where stated.
function desk(key, buckets, spec) {
  return {
    group: { key, buckets, floor: 4, ask: 7 },
    picks: spec
      .map(([region_bucket, consequence], i) => ({ region_bucket, consequence, title: `${key}-${i}` }))
      .sort((a, b) => b.consequence - a.consequence),
  };
}

test("merge fills the full target when the desks have the picks", () => {
  const perDesk = [
    desk("a", ["middle_east", "europe_russia"], [["middle_east", 90], ["middle_east", 88], ["europe_russia", 80], ["europe_russia", 70], ["middle_east", 60], ["middle_east", 55], ["europe_russia", 50]]),
    desk("b", ["asia", "south_asia", "americas"], [["asia", 85], ["asia", 75], ["south_asia", 65], ["americas", 60], ["asia", 55], ["americas", 50], ["south_asia", 45]]),
    desk("c", ["africa", "brics_trade", "global_institutions"], [["africa", 58], ["africa", 54], ["africa", 52], ["brics_trade", 50], ["global_institutions", 48], ["africa", 40], ["brics_trade", 35]]),
  ];
  const out = mergeDeskPicks(perDesk, 15);
  assert.strictEqual(out.length, 15);
});

test("merge gives every bucket its desk found a story for at least one slot", () => {
  // Desk c's three best picks are ALL Africa — the exact shape that left
  // global institutions off the page before the per-bucket sweep.
  const perDesk = [
    desk("a", ["middle_east", "europe_russia"], [["middle_east", 90], ["middle_east", 88], ["middle_east", 86], ["middle_east", 84], ["europe_russia", 40]]),
    desk("b", ["asia", "south_asia", "americas"], [["asia", 85], ["asia", 83], ["asia", 81], ["south_asia", 30], ["americas", 28]]),
    desk("c", ["africa", "brics_trade", "global_institutions"], [["africa", 58], ["africa", 56], ["africa", 54], ["brics_trade", 25], ["global_institutions", 20]]),
  ];
  const buckets = new Set(mergeDeskPicks(perDesk, 15).map((e) => e.region_bucket));
  for (const b of ["middle_east", "europe_russia", "asia", "south_asia", "americas", "africa", "brics_trade", "global_institutions"]) {
    assert.ok(buckets.has(b), `${b} was crowded out despite the desk having a story for it`);
  }
});

test("merge is output-ranked by consequence, so rank 1 is the biggest story", () => {
  const perDesk = [
    desk("a", ["middle_east", "europe_russia"], [["middle_east", 92], ["europe_russia", 70]]),
    desk("b", ["asia", "south_asia", "americas"], [["asia", 60], ["americas", 50]]),
    desk("c", ["africa", "brics_trade", "global_institutions"], [["africa", 40]]),
  ];
  const out = mergeDeskPicks(perDesk, 15);
  assert.strictEqual(out[0].consequence, 92);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].consequence >= out[i].consequence);
});

test("merge degrades honestly on a thin week rather than padding", () => {
  const perDesk = [
    desk("a", ["middle_east", "europe_russia"], [["middle_east", 70], ["europe_russia", 60]]),
    desk("b", ["asia", "south_asia", "americas"], [["asia", 50]]),
    desk("c", ["africa", "brics_trade", "global_institutions"], []),
  ];
  const out = mergeDeskPicks(perDesk, 15);
  assert.strictEqual(out.length, 3);
});

test("merge survives a dead desk, keeping the other two whole", () => {
  const perDesk = [
    desk("a", ["middle_east", "europe_russia"], [["middle_east", 90], ["middle_east", 85], ["europe_russia", 80], ["europe_russia", 75], ["middle_east", 70], ["europe_russia", 65], ["middle_east", 60]]),
    desk("b", ["asia", "south_asia", "americas"], [["asia", 88], ["asia", 78], ["south_asia", 68], ["americas", 58], ["asia", 48], ["americas", 38], ["south_asia", 28]]),
    desk("c", ["africa", "brics_trade", "global_institutions"], []), // selection call failed
  ];
  const out = mergeDeskPicks(perDesk, 15);
  assert.strictEqual(out.length, 14);
  assert.strictEqual(out[0].consequence, 90);
});

test("narration names the real count and numbers past five", () => {
  const events = Array.from({ length: 15 }, (_, i) => ({
    rank: i + 1, title: `Event ${i + 1}`, summary: "A thing happened.", reasoning: "It matters.",
  }));
  const text = briefingNarration({ title: "Week of August 3–9, 2026 — Hormuz" }, events);
  assert.ok(text.includes("top fifteen events"), "narration still says five");
  assert.ok(text.includes("Number fifteen:"), "narration lost its ordinals past eight");
  assert.ok(!/Number undefined/.test(text), "undefined ordinal leaked into the script");
  // Ranks past the fifth are read headline + why-it-matters only.
  assert.ok(text.includes("Also on the board this week"), "no brief-mode handoff");
});

test("narration still reads a five-event edition the old way", () => {
  const events = Array.from({ length: 5 }, (_, i) => ({
    rank: i + 1, title: `Event ${i + 1}`, summary: "A thing happened.", reasoning: "It matters.",
  }));
  const text = briefingNarration({ title: "Week of June 22–28, 2026 — Straits" }, events);
  assert.ok(text.includes("top five events"));
  assert.ok(!text.includes("Also on the board"), "brief-mode fired on a 5-event edition");
  assert.ok(text.includes("A thing happened."), "summaries dropped from the top five");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) { console.error("BRIEFING SELECTION GUARD TEST FAILED"); }
