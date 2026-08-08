// How the Weekly Briefing's fifteen events get de-duplicated and merged.
//
// ---------------------------------------------------------------------------
// Near-duplicate detection
//
// The weekly selector runs as three concurrent "desks" over disjoint region
// buckets (lib/seminarBuckets). Disjoint buckets do NOT give disjoint stories:
// a Saudi–Turkey–Pakistan defence pact is honestly Middle East and honestly
// South Asia, and a US Senate Russia-sanctions vote is honestly Europe/Russia
// and honestly geoeconomics. Each desk writes its own title off different wire
// copy, so exact-string matching catches none of it — the first two runs of the
// 15-event pipeline shipped "Mecca Joint Defense Pact" alongside "Makkah Joint
// Defense Pact", and "Russia Sanctions" alongside "Russian energy sanctions".
//
// Compare significant-word sets instead.

const TITLE_STOPWORDS = new Set([
  "with", "from", "into", "over", "amid", "after", "before", "that", "this",
  "than", "then", "they", "their", "them", "will", "would", "could", "have",
  "has", "been", "says", "said", "new", "more", "most", "first",
]);

// Crude stem: drop a possessive/plural "s", then keep the first six characters.
// Without it "Russia"/"Russian" and "sanction"/"sanctions" count as different
// words, which is how the second rendering of that Senate vote got through.
export function stem(w) {
  return w.replace(/(?:'s|s)$/, "").slice(0, 6);
}

export function titleTokens(t) {
  return new Set(
    String(t || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w))
      .map(stem)
  );
}

// Duplicate if the shorter title is mostly contained in the longer AND the
// overlap is substantive.
//
// MIN_SHARED_TOKENS is the part doing the real work. Containment alone would
// collapse "Russian Strikes Kill Four in Kyiv" into "Russian Strikes Kill Ten
// in Kharkiv" — two real, separate events that share three words. Requiring
// four shared significant words keeps those apart.
//
// CONTAINMENT is at 0.5 because the desks pad their titles by different
// amounts. "US Senate Passes Russia Sanctions Bill with Iran Sanctions
// Expansion" and "US Senate Passes Sweeping Russia Energy Sanctions Package"
// are one vote; they share {senate, passe, russia, sancti} but each carries
// seven tokens, so they score 4/7 = 0.57 and survived a 0.6 gate. Dropping the
// gate to 0.5 catches them, and the four-token floor is what keeps the Kyiv /
// Kharkiv and Hormuz-conditions / Hormuz-tanker pairs (three shared each)
// safely apart.
export const CONTAINMENT = 0.5;
export const MIN_SHARED_TOKENS = 4;

export function isDuplicateTitle(tokens, seenTokenSets) {
  if (!tokens || tokens.size === 0) return false;
  for (const prev of seenTokenSets) {
    let shared = 0;
    for (const w of tokens) if (prev.has(w)) shared++;
    if (shared < MIN_SHARED_TOKENS) continue;
    if (shared / Math.min(tokens.size, prev.size) >= CONTAINMENT) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Desk merge
//
// Each desk returns its picks sorted best-first. Merging them into one briefing
// happens in two passes:
//
//   Pass 1 — each desk is guaranteed `floor` slots, and it spends them on its
//   BEST STORY PER BUCKET before it spends them on score. A desk-level floor
//   alone is not enough: on one run the Africa / BRICS-trade / institutions
//   desk put three Africa stories at the top of its own ranking and took all
//   four of its slots with them, leaving global institutions uncovered on a
//   week where the desk had actually found a story for it. Breadth is the point
//   of the fifteen-event briefing, so inside a desk breadth wins the first
//   slots and score wins the rest.
//
//   Pass 2 — the remaining slots go to the strongest leftovers from any desk,
//   which is where a genuinely enormous week in one region gets its due.
//
// `perDesk` is [{ group, picks }] with picks already sorted by consequence desc.
// Returns the merged list, still sorted by consequence desc, capped at `target`.
export function mergeDeskPicks(perDesk, target) {
  const chosen = [];
  const leftovers = [];

  for (const { group, picks } of perDesk) {
    const taken = new Set();
    for (const bucket of group.buckets) {
      if (taken.size >= group.floor) break;
      const i = picks.findIndex((p, idx) => !taken.has(idx) && p.region_bucket === bucket);
      if (i !== -1) taken.add(i);
    }
    // Any floor slots the bucket sweep did not use go by score.
    for (let i = 0; i < picks.length && taken.size < group.floor; i++) taken.add(i);
    picks.forEach((p, i) => (taken.has(i) ? chosen : leftovers).push(p));
  }

  leftovers.sort((a, b) => b.consequence - a.consequence);
  chosen.push(...leftovers.slice(0, Math.max(0, target - chosen.length)));

  return chosen.sort((a, b) => b.consequence - a.consequence).slice(0, target);
}
