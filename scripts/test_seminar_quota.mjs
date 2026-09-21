// Guard test for the locked weekly-debrief topic quota.
//
//   node scripts/test_seminar_quota.mjs        (also wired as `npm test`)
//
// THE RULE THIS PROTECTS (John, locked and re-stated repeatedly):
//   - 15 items total per weekly debrief.
//   - MAXIMUM 5 on the Iran war. A ceiling, not a target.
//   - The other 10 MUST cover emerging foreign policy, terrorism,
//     cartels/narcotics, and relations in the Americas.
//   - A category with no qualifying story is REPORTED, never padded.
//
// Section A fails the build if the rule constants themselves are weakened or
// removed. Sections B-E prove the enforcement actually does the work — the
// prompt has drifted before, so the post-selection pass is what is under test.
//
// Pure functions only: no DB, no Claude, no network.
import assert from "node:assert";
import {
  BUCKETS,
  BUCKET_KEYS,
  REQUIRED_BUCKETS,
  TOTAL_ITEMS,
  IRAN_BUCKET,
  IRAN_MAX,
  bucketDef,
  classifyCandidate,
  reconcileCategory,
  buildCandidatePool,
  enforceQuotas,
  formatSplitLine,
  validateEdition,
  ANALYSIS_TIER,
  NEWS_TIER,
  ANALYSIS_RECENCY_BONUS_DAYS,
  ANALYSIS_POOL_FLOOR,
  MAX_PER_SOURCE_PER_BUCKET,
  poolScoreMs,
  tierOf,
  poolTierCounts,
  editionTierCounts,
} from "../lib/seminarQuota.js";
import {
  SEMINAR_FEEDS,
  ANALYSIS_SOURCE_NAMES,
  TIER_LOOKBACK_DAYS,
  feedTier,
} from "../lib/seminarFeeds.js";
import { seminarHealth } from "../lib/seminarWeek.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

// --- fixtures ---------------------------------------------------------------

let nextId = 1;
// Sources ROTATE by default. A single-source fixture would quietly sail past the
// per-source cap that section H exists to protect, and the cap is real: a shipped
// edition once ran three of its four Americas items off one outlet.
function row(title, source = null, region = "INTL", body = "", extra = {}) {
  const id = nextId++;
  return {
    id,
    source: source || `Test Feed ${id % 9}`,
    url: `https://example.test/${id}`,
    title,
    body_html: body,
    region_tag: region,
    ...extra,
  };
}
function poolOf(specs) {
  // specs: [[bucketKey, count, titleTemplate]]
  const out = [];
  for (const [bucket, count, title] of specs) {
    for (let i = 0; i < count; i++) out.push({ row: row(`${title} ${i + 1}`), bucket });
  }
  return out;
}
function modelItem(bucket, title, rank) {
  return { rank, title, summary: "s", reasoning: "r", bucket, source_row: row(title), origin: "model" };
}

// A pool rich enough to satisfy every minimum.
function richPool() {
  return poolOf([
    ["emerging_fp", 12, "Emerging FP story"],
    ["terrorism", 10, "Terror story"],
    ["cartels_narcotics", 10, "Cartel story"],
    ["americas", 10, "Americas story"],
    ["us_foreign_policy", 6, "US FP story"],
    [IRAN_BUCKET, 20, "Iran story"],
  ]);
}

// ===========================================================================
// A. The rule constants — these fail the build if the quota is weakened.
// ===========================================================================

test("GUARD: edition size is locked at 15 items", () => {
  assert.strictEqual(TOTAL_ITEMS, 15, "TOTAL_ITEMS must stay 15 — John's locked rule");
});

test("GUARD: the Iran ceiling is locked at 5", () => {
  assert.strictEqual(IRAN_MAX, 5, "IRAN_MAX must stay 5 — it is a ceiling, not a target");
  assert.strictEqual(bucketDef(IRAN_BUCKET).max, 5, "the iran_war bucket must carry max 5");
});

test("GUARD: the four required categories still exist with real minimums", () => {
  const required = new Set(REQUIRED_BUCKETS.map((b) => b.key));
  for (const key of ["emerging_fp", "terrorism", "cartels_narcotics", "americas"]) {
    assert.ok(required.has(key), `required category ${key} was removed`);
    assert.ok(bucketDef(key).min >= 2, `${key} minimum must be at least 2, got ${bucketDef(key).min}`);
  }
});

test("GUARD: the required minimums force 10 non-Iran items alongside a full Iran week", () => {
  const minSum = REQUIRED_BUCKETS.reduce((n, b) => n + b.min, 0);
  assert.ok(minSum >= 9, `required minimums total ${minSum}, must be >= 9`);
  assert.ok(
    minSum + IRAN_MAX <= TOTAL_ITEMS,
    "minimums plus the Iran ceiling must fit inside the edition size"
  );
  // With Iran at its ceiling, the other 10 slots are still quota-governed.
  assert.strictEqual(TOTAL_ITEMS - IRAN_MAX, 10, "the non-Iran remainder must be 10 items");
});

test("GUARD: americas is separate from US foreign policy, and US FP is capped", () => {
  assert.ok(BUCKET_KEYS.includes("americas"));
  assert.ok(BUCKET_KEYS.includes("us_foreign_policy"));
  assert.ok(
    bucketDef("us_foreign_policy").max <= 2,
    "us_foreign_policy must stay capped so a Washington story cannot absorb the Americas quota"
  );
});

test("GUARD: validateEdition rejects a breached ceiling and an undeclared shortfall", () => {
  const over = { [IRAN_BUCKET]: 6, emerging_fp: 3, terrorism: 2, cartels_narcotics: 2, americas: 2 };
  assert.strictEqual(validateEdition(over, [], 15).ok, false, "6 Iran items must fail validation");

  const missing = { [IRAN_BUCKET]: 5, emerging_fp: 3, terrorism: 0, cartels_narcotics: 2, americas: 2 };
  assert.strictEqual(
    validateEdition(missing, [], 12).ok, false,
    "an empty required category with no declared shortfall must fail validation"
  );
  // Same counts, but honestly declared — that is allowed.
  const declared = validateEdition(
    missing,
    [{ bucket: "terrorism" }, { bucket: "_total" }],
    12
  );
  assert.strictEqual(declared.ok, true, "a DECLARED shortfall is legitimate: " + declared.problems.join("; "));
});

// ===========================================================================
// B. Enforcement when the model over-returns Iran (the real-world failure).
// ===========================================================================

test("ENFORCE: a model that returns 12 Iran items gets trimmed to the ceiling", () => {
  const items = [];
  for (let i = 0; i < 12; i++) items.push(modelItem(IRAN_BUCKET, `Iran item ${i + 1}`, i + 1));
  items.push(modelItem("emerging_fp", "China story", 13));
  items.push(modelItem("terrorism", "ISIS story", 14));
  items.push(modelItem("us_foreign_policy", "Pentagon story", 15));

  const out = enforceQuotas(items, richPool(), { total: TOTAL_ITEMS });

  assert.strictEqual(out.counts[IRAN_BUCKET], IRAN_MAX, `Iran should be trimmed to ${IRAN_MAX}, got ${out.counts[IRAN_BUCKET]}`);
  assert.ok(out.dropped.length >= 7, `expected >=7 Iran drops, got ${out.dropped.length}`);
  assert.strictEqual(out.total, TOTAL_ITEMS, `edition should be refilled to ${TOTAL_ITEMS}, got ${out.total}`);
  assert.strictEqual(validateEdition(out.counts, out.shortfalls, out.total).ok, true);
});

test("ENFORCE: the highest-ranked Iran items are the ones kept", () => {
  const items = [];
  for (let i = 0; i < 9; i++) items.push(modelItem(IRAN_BUCKET, `Iran item ${i + 1}`, i + 1));
  const out = enforceQuotas(items, richPool(), { total: TOTAL_ITEMS });
  const keptIran = out.items.filter((i) => i.bucket === IRAN_BUCKET).map((i) => i.title);
  assert.deepStrictEqual(
    keptIran,
    ["Iran item 1", "Iran item 2", "Iran item 3", "Iran item 4", "Iran item 5"],
    "the ceiling must keep the best-ranked Iran items, not an arbitrary five"
  );
});

test("ENFORCE: dropped Iran slots are backfilled into the required categories", () => {
  const items = [];
  for (let i = 0; i < 15; i++) items.push(modelItem(IRAN_BUCKET, `Iran item ${i + 1}`, i + 1));

  const out = enforceQuotas(items, richPool(), { total: TOTAL_ITEMS });

  for (const b of REQUIRED_BUCKETS) {
    assert.ok(
      out.counts[b.key] >= b.min,
      `${b.key} should have been backfilled to >= ${b.min}, got ${out.counts[b.key]}`
    );
  }
  assert.strictEqual(out.counts[IRAN_BUCKET], IRAN_MAX);
  const backfilled = out.items.filter((i) => i.origin === "backfill").length;
  assert.ok(backfilled >= 9, `expected >=9 backfilled items, got ${backfilled}`);
});

test("ENFORCE: an all-Iran week is never padded back up with more Iran", () => {
  const items = [];
  for (let i = 0; i < 15; i++) items.push(modelItem(IRAN_BUCKET, `Iran item ${i + 1}`, i + 1));
  // Pool has only Iran left to offer.
  const out = enforceQuotas(items, poolOf([[IRAN_BUCKET, 40, "Spare Iran story"]]), { total: TOTAL_ITEMS });
  assert.strictEqual(out.counts[IRAN_BUCKET], IRAN_MAX, "Iran must not be topped back up past the ceiling");
  assert.ok(out.total <= TOTAL_ITEMS);
  assert.ok(out.shortfalls.length > 0, "a week with nothing but Iran must report shortfalls");
});

// ===========================================================================
// C. Shortfall path — honest reporting, never padding.
// ===========================================================================

test("SHORTFALL: an empty category is reported, not filled with something else", () => {
  const items = [
    modelItem(IRAN_BUCKET, "Iran strike", 1),
    modelItem("emerging_fp", "China story", 2),
  ];
  // Pool deliberately has NO terrorism stories this week.
  const pool = poolOf([
    ["emerging_fp", 12, "Emerging FP story"],
    ["cartels_narcotics", 10, "Cartel story"],
    ["americas", 10, "Americas story"],
    [IRAN_BUCKET, 10, "Iran story"],
  ]);

  const out = enforceQuotas(items, pool, { total: TOTAL_ITEMS });

  assert.strictEqual(out.counts.terrorism, 0, "terrorism had no qualifying stories — it must stay 0");
  const note = out.shortfalls.find((s) => s.bucket === "terrorism");
  assert.ok(note, "the terrorism shortfall must be reported");
  assert.match(note.note, /terrorism: 0 — no qualifying stories this week/);
  // And the shortfall must be visible in the printed split.
  assert.match(formatSplitLine(out.counts, out.shortfalls, out.total), /no qualifying stories this week/);
  assert.strictEqual(validateEdition(out.counts, out.shortfalls, out.total).ok, true);
});

test("SHORTFALL: a partially-filled category reports how short it is", () => {
  const pool = poolOf([
    ["emerging_fp", 12, "Emerging FP story"],
    ["terrorism", 1, "Lone terror story"],
    ["cartels_narcotics", 10, "Cartel story"],
    ["americas", 10, "Americas story"],
    [IRAN_BUCKET, 10, "Iran story"],
  ]);
  const out = enforceQuotas([modelItem(IRAN_BUCKET, "Iran strike", 1)], pool, { total: TOTAL_ITEMS });
  assert.strictEqual(out.counts.terrorism, 1);
  const note = out.shortfalls.find((s) => s.bucket === "terrorism");
  assert.ok(note && /terrorism: 1 of 2/.test(note.note), `expected a 1-of-2 note, got ${note && note.note}`);
});

test("SHORTFALL: a thin overall week publishes fewer items and says so", () => {
  const pool = poolOf([["emerging_fp", 2, "Emerging FP story"], ["terrorism", 1, "Terror story"]]);
  const out = enforceQuotas([], pool, { total: TOTAL_ITEMS });
  assert.ok(out.total < TOTAL_ITEMS, "a thin week should publish fewer than 15");
  assert.ok(out.shortfalls.some((s) => s.bucket === "_total"), "the short total must be declared");
  assert.match(formatSplitLine(out.counts, out.shortfalls, out.total), /did not carry 15 qualifying stories/);
});

// ===========================================================================
// D. The classifier — the category split that stops absorption.
// ===========================================================================

test("CLASSIFY: a cartel story in Mexico is cartels_narcotics, not americas", () => {
  assert.strictEqual(
    classifyCandidate(row("Sinaloa cartel fentanyl lab dismantled in Mexico", "Borderland Beat", "MEX")),
    "cartels_narcotics"
  );
});

test("CLASSIFY: a Latin America story is americas even when Washington is a party", () => {
  assert.strictEqual(
    classifyCandidate(row("White House opens talks with Brazil and Colombia on hemispheric trade", "Reuters", "US")),
    "americas",
    "a Latin America story must not be absorbed by the US-foreign-policy bucket"
  );
});

test("CLASSIFY: a terrorism story stays terrorism even with Iran in the text", () => {
  assert.strictEqual(
    classifyCandidate(row("Hezbollah claims rocket attack as Iran signals support", "Al Jazeera", "QAT")),
    "terrorism",
    "terrorism outranks the Iran ceiling bucket on purpose"
  );
});

test("CLASSIFY: an Iran conflict story is iran_war", () => {
  assert.strictEqual(
    classifyCandidate(row("Israel strikes Iranian missile site as IRGC vows retaliation", "Times of Israel", "ISR")),
    IRAN_BUCKET
  );
});

test("CLASSIFY: 'Iran' alone in a soft story does not consume an Iran slot", () => {
  const b = classifyCandidate(row("Iran opens new petrochemical export terminal for regional buyers", "Press TV", "IRI"));
  assert.notStrictEqual(b, IRAN_BUCKET, "a non-conflict Iran headline must not take an Iran-war slot");
});

test("CLASSIFY: hard geopolitics falls through to emerging_fp", () => {
  assert.strictEqual(
    classifyCandidate(row("NATO and Japan sign new defence technology pact", "BBC World", "UK")),
    "emerging_fp"
  );
});

// ===========================================================================
// E. The candidate pool — volume must not decide what the model can see.
// ===========================================================================

test("POOL: low-volume Americas and crime feeds survive a high-volume Iran week", () => {
  const rows = [];
  // A flood of Iran-war copy, the way the real feeds behave.
  for (let i = 0; i < 300; i++) {
    rows.push(row(`Iran missile strike update ${i}`, i % 2 ? "Press TV" : "Tehran Times", "IRI"));
  }
  // A handful of low-volume crime / Americas stories, last in recency order.
  for (let i = 0; i < 6; i++) rows.push(row(`Sinaloa cartel fentanyl seizure ${i}`, "InSight Crime", "INTL"));
  for (let i = 0; i < 6; i++) rows.push(row(`Venezuela and Colombia reopen border talks ${i}`, "Caracas Chronicles", "VEN"));

  const pool = buildCandidatePool(rows, { limit: 180 });
  const counts = {};
  for (const c of pool) if (c.bucket) counts[c.bucket] = (counts[c.bucket] || 0) + 1;

  assert.strictEqual(counts.cartels_narcotics, 6, "every cartel story must reach the prompt");
  assert.strictEqual(counts.americas, 6, "every Americas story must reach the prompt");
  assert.ok(
    counts[IRAN_BUCKET] <= bucketDef(IRAN_BUCKET).poolCap,
    `Iran candidates must be capped at ${bucketDef(IRAN_BUCKET).poolCap}, got ${counts[IRAN_BUCKET]}`
  );
});

test("POOL: the guaranteed slots are enough to fill every required minimum", () => {
  for (const b of REQUIRED_BUCKETS) {
    assert.ok(
      b.poolGuarantee >= b.min,
      `${b.key} reserves ${b.poolGuarantee} candidates but needs to fill ${b.min}`
    );
  }
});

// ===========================================================================
// F. The printed split.
// ===========================================================================

test("SPLIT: the line prints the item count and every category", () => {
  const items = [];
  for (let i = 0; i < 15; i++) items.push(modelItem(IRAN_BUCKET, `Iran item ${i + 1}`, i + 1));
  const out = enforceQuotas(items, richPool(), { total: TOTAL_ITEMS });
  const line = formatSplitLine(out.counts, out.shortfalls, out.total);

  assert.match(line, /^15 items —/, `split line should lead with the count: ${line}`);
  for (const b of BUCKETS) {
    assert.ok(line.includes(b.label), `split line is missing ${b.label}: ${line}`);
  }
  assert.match(line, /Iran war 5/);
});

// ===========================================================================
// G. Category reconciliation — the ceiling counts what a story IS.
// ===========================================================================

test("RECONCILE: an Iran-war story filed as emerging_fp still counts against the Iran ceiling", () => {
  assert.strictEqual(
    reconcileCategory("emerging_fp", row("Iran rejects IAEA inspectors as enrichment at Fordow resumes")),
    IRAN_BUCKET
  );
  assert.strictEqual(
    reconcileCategory("us_foreign_policy", row("Pentagon weighs new strikes on Iran missile sites")),
    IRAN_BUCKET
  );
});

test("RECONCILE: a genuine terrorism story is not pulled into the Iran count", () => {
  assert.strictEqual(
    reconcileCategory("terrorism", row("Hezbollah claims rocket attack as Iran signals support")),
    "terrorism"
  );
});

test("RECONCILE: an Americas or cartel call by the model stands", () => {
  assert.strictEqual(
    reconcileCategory("americas", row("Venezuela takes delivery of Iranian military drones")),
    "americas"
  );
  assert.strictEqual(
    reconcileCategory("cartels_narcotics", row("Sinaloa cartel fentanyl lab raided in Culiacan")),
    "cartels_narcotics"
  );
});

test("RECONCILE: an invalid model category falls back to the classifier", () => {
  assert.strictEqual(
    reconcileCategory("not_a_bucket", row("Sinaloa cartel fentanyl lab raided in Culiacan")),
    "cartels_narcotics"
  );
});

test("ENFORCE: seven Iran items disguised across categories still end at the ceiling once reconciled", () => {
  const titles = [
    "Israel strikes Iranian missile site as IRGC vows retaliation",
    "Iran rejects IAEA inspectors as enrichment at Fordow resumes",
    "Khamenei rules out ceasefire talks",
    "Pentagon weighs new strikes on Iran missile sites",
    "Iran drone salvo hits Israeli air base",
    "Snapback sanctions vote on Iran nuclear programme",
    "Iranian missile attack on Gulf tanker in Strait of Hormuz",
  ];
  const claimed = ["iran_war", "emerging_fp", "emerging_fp", "us_foreign_policy", "iran_war", "emerging_fp", "emerging_fp"];
  const items = titles.map((t, i) => {
    const it = modelItem(claimed[i], t, i + 1);
    it.bucket = reconcileCategory(it.bucket, it.source_row);
    return it;
  });
  const out = enforceQuotas(items, richPool(), { total: TOTAL_ITEMS });
  assert.strictEqual(out.counts[IRAN_BUCKET], IRAN_MAX);
  assert.strictEqual(validateEdition(out.counts, out.shortfalls, out.total).ok, true);
});

// ===========================================================================
// H. Source tiers — think tanks weighted above news wires (2026-09-21).
//
// John's instruction: the analysis layer gets "more weight than news feeds".
// These fail the build if the weighting, the wider analysis lookback or the
// per-source cap is removed — all three are load-bearing, and the first two are
// the difference between "we added think-tank feeds" and "the think tanks
// actually appear in the brief".
// ===========================================================================

const DAY = 86400000;
function tieredRow(title, source, tier, ageDays, region = "NGO") {
  return row(title, source, region, "", {
    tier,
    ts: new Date(Date.now() - ageDays * DAY).toISOString(),
  });
}

test("GUARD: every feed carries a tier, and the tier is a property of the feed", () => {
  for (const f of SEMINAR_FEEDS) {
    assert.ok(
      f.tier === ANALYSIS_TIER || f.tier === NEWS_TIER,
      `feed "${f.name}" has no valid tier — tiers must be declared on the feed, not inferred`
    );
    assert.strictEqual(feedTier(f), f.tier);
  }
  assert.ok(
    ANALYSIS_SOURCE_NAMES.length >= 20,
    `expected at least 20 analysis sources, got ${ANALYSIS_SOURCE_NAMES.length}`
  );
  // Derived from the feed list, so a new feed inherits the weighting for free.
  const declared = SEMINAR_FEEDS.filter((f) => f.tier === ANALYSIS_TIER).map((f) => f.name);
  assert.deepStrictEqual(ANALYSIS_SOURCE_NAMES, declared);
});

test("GUARD: analysis reaches back further than news, or weekly pieces never qualify", () => {
  assert.ok(TIER_LOOKBACK_DAYS[NEWS_TIER] >= 7, "news must cover a full 7-day week");
  assert.ok(
    TIER_LOOKBACK_DAYS[ANALYSIS_TIER] >= 21,
    `analysis lookback is ${TIER_LOOKBACK_DAYS[ANALYSIS_TIER]} days — a weekly think-tank piece needs >= 21`
  );
});

test("GUARD: John's thin categories each have a dedicated analysis source", () => {
  const names = ANALYSIS_SOURCE_NAMES.join(" | ");
  for (const needle of ["GI-TOC", "Igarapé", "Jamestown", "Long War Journal", "Crisis Group"]) {
    assert.ok(names.includes(needle), `analysis tier lost its ${needle} source`);
  }
});

test("WEIGHT: a 4-day-old think-tank piece outranks a 4-hour-old wire story", () => {
  // John's own example, asserted directly.
  const analysis = tieredRow("Chatham House on Gulf deterrence", "Chatham House", ANALYSIS_TIER, 4);
  const wire = tieredRow("Wire update", "BBC World", NEWS_TIER, 4 / 24, "UK");
  assert.ok(
    poolScoreMs(analysis) > poolScoreMs(wire),
    "the whole point of the tier change: analysis must outrank fresher wire copy"
  );
  assert.ok(ANALYSIS_RECENCY_BONUS_DAYS >= 7, "the bonus must cover at least a publishing week");
});

test("WEIGHT: an untagged row is treated as news and is never promoted", () => {
  assert.strictEqual(tierOf({ title: "x" }), NEWS_TIER);
  assert.strictEqual(tierOf({ tier: "something-else" }), NEWS_TIER);
});

test("WEIGHT: analysis survives a pool flooded with fresher wire copy", () => {
  const rows = [];
  // 400 wire stories from today, the way a real week actually looks.
  for (let i = 0; i < 400; i++) {
    rows.push(tieredRow(`NATO and Japan defence pact update ${i}`, `Wire ${i % 6}`, NEWS_TIER, i / 400, "UK"));
  }
  // A dozen think-tank pieces, all older than every wire story.
  for (let i = 0; i < 12; i++) {
    rows.push(tieredRow(`Chatham House on China supply chains ${i}`, `Institute ${i % 4}`, ANALYSIS_TIER, 5 + i));
  }
  const pool = buildCandidatePool(rows, { limit: 120 });
  const tiers = poolTierCounts(pool);
  assert.strictEqual(
    tiers[ANALYSIS_TIER], 12,
    `every analysis piece must reach the prompt, got ${tiers[ANALYSIS_TIER]} of 12`
  );
  // And they must be near the FRONT, not tacked on the end.
  const firstTwenty = pool.slice(0, 20).filter((c) => tierOf(c.row) === ANALYSIS_TIER).length;
  assert.ok(firstTwenty >= 6, `analysis should lead the pool, only ${firstTwenty} in the first 20`);
});

test("WEIGHT: the analysis floor holds slots even when a category sweep would spend them", () => {
  assert.ok(ANALYSIS_POOL_FLOOR >= 20, `analysis pool floor is ${ANALYSIS_POOL_FLOOR} — too small to guarantee anything`);
  const rows = [];
  for (let i = 0; i < 500; i++) {
    rows.push(tieredRow(`Sinaloa cartel fentanyl seizure ${i}`, `Wire ${i % 5}`, NEWS_TIER, i / 500, "MEX"));
  }
  for (let i = 0; i < 30; i++) {
    rows.push(tieredRow(`GI-TOC on trafficking routes ${i}`, `Institute ${i % 5}`, ANALYSIS_TIER, 20));
  }
  const pool = buildCandidatePool(rows, { limit: 200 });
  assert.ok(
    poolTierCounts(pool)[ANALYSIS_TIER] >= 25,
    `the analysis floor should hold its slots, got ${poolTierCounts(pool)[ANALYSIS_TIER]}`
  );
});

test("SOURCE CAP: one outlet cannot take more than two slots in a category", () => {
  // The exact failure that prompted this: four Americas items, three from one source.
  const items = [
    { rank: 1, title: "Americas A", bucket: "americas", source_row: row("Americas A", "One Outlet"), origin: "model" },
    { rank: 2, title: "Americas B", bucket: "americas", source_row: row("Americas B", "One Outlet"), origin: "model" },
    { rank: 3, title: "Americas C", bucket: "americas", source_row: row("Americas C", "One Outlet"), origin: "model" },
    { rank: 4, title: "Americas D", bucket: "americas", source_row: row("Americas D", "One Outlet"), origin: "model" },
  ];
  const out = enforceQuotas(items, richPool(), { total: TOTAL_ITEMS });
  const fromOne = out.items.filter(
    (i) => i.bucket === "americas" && i.source_row && i.source_row.source === "One Outlet"
  ).length;
  assert.ok(
    fromOne <= MAX_PER_SOURCE_PER_BUCKET,
    `one outlet kept ${fromOne} Americas slots, cap is ${MAX_PER_SOURCE_PER_BUCKET}`
  );
  assert.ok(
    out.dropped.some((d) => /per-source cap/.test(d.dropped_because || "")),
    "the drop must say why it happened"
  );
  // The freed slots are refilled, not lost.
  assert.strictEqual(out.total, TOTAL_ITEMS);
});

test("SOURCE CAP: backfill does not rebuild the concentration it just broke up", () => {
  // Pool offers Americas stories from one outlet only.
  const pool = [];
  for (let i = 0; i < 10; i++) {
    pool.push({ row: row(`Americas filler ${i}`, "One Outlet"), bucket: "americas" });
  }
  for (let i = 0; i < 10; i++) {
    pool.push({ row: row(`Terror filler ${i}`, `Outlet ${i}`), bucket: "terrorism" });
  }
  const out = enforceQuotas([], pool, { total: TOTAL_ITEMS });
  const fromOne = out.items.filter(
    (i) => i.bucket === "americas" && i.source_row && i.source_row.source === "One Outlet"
  ).length;
  assert.ok(fromOne <= MAX_PER_SOURCE_PER_BUCKET, `backfill stacked ${fromOne} items from one outlet`);
});

test("GUARD: validateEdition fails an edition that breaches the per-source cap", () => {
  const counts = { [IRAN_BUCKET]: 5, emerging_fp: 3, terrorism: 2, cartels_narcotics: 2, americas: 3 };
  const items = ["A", "B", "C"].map((t) => ({
    bucket: "americas",
    title: t,
    source_row: row(t, "One Outlet"),
  }));
  const v = validateEdition(counts, [], 15, items);
  assert.strictEqual(v.ok, false, "three items from one source in one category must fail validation");
  assert.ok(v.problems.some((p) => /per-source cap/.test(p)));
});

test("REPORT: the edition can say how many of its items came from the analysis tier", () => {
  const items = [
    { bucket: "americas", source_row: row("a", "Institute", "NGO", "", { tier: ANALYSIS_TIER }) },
    { bucket: "americas", source_row: row("b", "Wire") },
  ];
  const t = editionTierCounts(items);
  assert.strictEqual(t[ANALYSIS_TIER], 1);
  assert.strictEqual(t[NEWS_TIER], 1);
});

// ===========================================================================
// I. Once-weekly cadence (2026-09-21).
// ===========================================================================

test("GUARD: the mid-week refresh is gone and cannot silently come back", () => {
  const now = new Date("2026-09-24T18:00:00Z"); // a Thursday afternoon
  const h = seminarHealth({
    latestWeekStart: "2026-09-21",
    latestPublishedAt: "2026-09-21T11:30:00Z", // Monday's edition, nothing since
    now,
  });
  assert.strictEqual(h.mid_week_stale, false, "a Thursday must never be reported stale — the brief is weekly now");
  assert.strictEqual(h.healthy, true, "Monday's edition is the only edition of the week; Thursday is not a miss");
});

test("GUARD: a genuinely missed Monday is still caught", () => {
  const h = seminarHealth({
    latestWeekStart: "2026-09-14",
    latestPublishedAt: "2026-09-14T11:30:00Z",
    now: new Date("2026-09-23T18:00:00Z"),
  });
  assert.strictEqual(h.up_to_date, false);
  assert.strictEqual(h.skip, true, "the weekly skip alarm must still fire");
  assert.strictEqual(h.healthy, false);
});

console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ""}\n`);
