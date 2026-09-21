// Topic quota engine for the weekly FP seminar debrief.
//
// THE RULE (locked by John, re-stated repeatedly):
//   - 15 items total per weekly debrief.
//   - MAXIMUM 5 on the Iran war. A ceiling, not a target.
//   - The other 10 MUST cover: emerging foreign-policy issues, terrorism,
//     cartels/narcotics, and relations in the Americas.
//   - The edition must PRINT its own per-category split at the top.
//
// Everything here is a pure function: no DB, no network, no Claude. The route
// does I/O; this module decides. That split is deliberate — the enforcement
// below is the part that has to keep working when the model's prompt drifts,
// so it has to be testable without standing anything up.
//
// A prompt instruction alone has already failed repeatedly. `enforceQuotas`
// runs AFTER the model returns and is authoritative: it drops Iran items over
// the ceiling, backfills empty required categories from the candidate pool,
// and — when a category genuinely has no qualifying story — reports the
// shortfall honestly instead of padding the count with an unrelated item.

// ---------------------------------------------------------------------------
// Bucket definitions
// ---------------------------------------------------------------------------

export const TOTAL_ITEMS = 15;
export const IRAN_BUCKET = "iran_war";
export const IRAN_MAX = 5;

// `min` is a floor the enforcer backfills toward; `max` is a hard ceiling it
// trims down to. `required` buckets are John's "other 10" — a required bucket
// that cannot be filled is REPORTED, never padded.
//
// Minimums total 9 (3+2+2+2). With the Iran ceiling at 5 that is 14 of 15
// committed, leaving one flexible slot — so a 5-item Iran week still forces
// 10 non-Iran items spread across the four required categories.
export const BUCKETS = [
  {
    key: IRAN_BUCKET,
    label: "Iran war",
    min: 0,
    max: IRAN_MAX,
    required: false,
    poolGuarantee: 0, // capped in the pool, not guaranteed
    poolCap: 30,
    desc:
      "iran_war (the Iran war itself: Iran-Israel-US military exchange, strikes, " +
      "missile and drone salvos, IRGC operations, the nuclear programme and " +
      "enrichment, IAEA/snapback diplomacy, ceasefire terms, Hormuz escalation)",
  },
  {
    key: "emerging_fp",
    label: "Emerging foreign policy",
    min: 3,
    max: TOTAL_ITEMS,
    required: true,
    poolGuarantee: 24,
    desc:
      "emerging_fp (emerging foreign-policy issues: new or shifting alignments, " +
      "deterrence and alliance politics, nuclear and arms control, China/Taiwan, " +
      "Russia/Ukraine/NATO, Korea, India, Africa, sanctions, tariffs, " +
      "de-dollarisation, supply chains, cyber, space and Arctic competition)",
  },
  {
    key: "terrorism",
    label: "Terrorism",
    min: 2,
    max: TOTAL_ITEMS,
    required: true,
    poolGuarantee: 18,
    desc:
      "terrorism (terrorism and violent non-state actors: ISIS, al-Qaeda and " +
      "affiliates, Hezbollah, Hamas, the Houthis, al-Shabaab, Boko Haram, the " +
      "Taliban/TTP, insurgency, attacks and plots, designations, counter-terror " +
      "operations, radicalisation and terror financing)",
  },
  {
    key: "cartels_narcotics",
    label: "Cartels & narcotics",
    min: 2,
    max: TOTAL_ITEMS,
    required: true,
    poolGuarantee: 18,
    desc:
      "cartels_narcotics (cartels, narcotics and transnational organised crime: " +
      "Sinaloa, CJNG, Tren de Aragua, MS-13, fentanyl and precursor chemicals, " +
      "cocaine and methamphetamine trafficking, kingpin prosecutions, DEA and " +
      "Treasury actions, smuggling routes, narco-violence and laundering)",
  },
  {
    key: "americas",
    label: "Americas",
    min: 2,
    max: TOTAL_ITEMS,
    required: true,
    poolGuarantee: 18,
    desc:
      "americas (relations IN the Americas: Mexico, Venezuela, Colombia, Brazil, " +
      "Argentina, Chile, Peru, Cuba, Haiti, Central America and the Caribbean — " +
      "hemispheric diplomacy, migration, trade and energy ties, elections and " +
      "governance. NOT a story that is really about a cartel (use " +
      "cartels_narcotics) and NOT a story that is really about Washington's own " +
      "conduct (use us_foreign_policy))",
  },
  {
    key: "us_foreign_policy",
    label: "US foreign policy",
    min: 0,
    max: 2, // capped so US-domestic-foreign stories cannot crowd out the Americas
    required: false,
    poolGuarantee: 10,
    desc:
      "us_foreign_policy (Washington's own foreign-policy conduct where it does " +
      "not belong to a category above: administration doctrine, Congress and war " +
      "powers, defence budgets and posture, aid and diplomacy)",
  },
];

export const BUCKET_KEYS = BUCKETS.map((b) => b.key);
export const REQUIRED_BUCKETS = BUCKETS.filter((b) => b.required);
export const BUCKET_LABEL = Object.fromEntries(BUCKETS.map((b) => [b.key, b.label]));
const BUCKET_BY_KEY = Object.fromEntries(BUCKETS.map((b) => [b.key, b]));

export function bucketDef(key) {
  return BUCKET_BY_KEY[key] || null;
}

export function isValidBucket(key) {
  return Object.prototype.hasOwnProperty.call(BUCKET_BY_KEY, key);
}

/** Human-readable bucket menu for the selection prompt. */
export function bucketPromptDescription() {
  return BUCKETS.map((b) => b.desc).join(", ");
}

// ---------------------------------------------------------------------------
// Candidate classifier
// ---------------------------------------------------------------------------
//
// Used for two things ONLY: (a) shaping the candidate pool so low-volume
// Americas/crime feeds are guaranteed into the prompt, and (b) labelling
// backfill items when the enforcer has to repair the model's answer. The
// model still assigns the bucket for items it picked itself.
//
// Precedence is deliberate and is the "split americas away from US-domestic-
// foreign" fix: a cartel story is a cartel story even when it happens in
// Mexico, and a Latin America story is an Americas story even when Washington
// is a party to it. Iran sits BELOW terrorism on purpose — the Iran bucket is
// a ceiling, so anything that is genuinely a terrorism story should land in
// terrorism rather than consume one of the five Iran slots.

const PATTERNS = {
  cartels_narcotics: [
    /\bcartel(s|es)?\b/i,
    /\bnarco[-\s]?(state|traffick\w*|terror\w*|politic\w*|violence|sub|boat)?\b/i,
    /\bfentanyl\b/i,
    /\bcocaine\b/i,
    /\bmethamphetamine\b|\bmeth lab\b/i,
    /\bheroin\b|\bopioid(s)?\b/i,
    /\bdrug (traffick\w*|trade|war|smuggl\w*|cartel|lord|runn\w*|seizure)/i,
    /\b(traffick\w*) (ring|network|organi[sz]ation)\b/i,
    /\bsinaloa\b|\bcjng\b|\bjalisco new generation\b/i,
    /\btren de aragua\b|\bms-?13\b|\bmara salvatrucha\b/i,
    /\bel (chapo|mayo)\b|\bchapitos\b|\bkingpin\b/i,
    /\bprecursor chemical(s)?\b/i,
    /\bdea\b|\bdrug enforcement administration\b/i,
    /\bmoney laundering\b/i,
    /\bsmuggl\w+\b/i,
  ],
  terrorism: [
    /\bterror(ism|ist|ists)?\b/i,
    /\bisis\b|\bisil\b|\bislamic state\b|\bdaesh\b/i,
    /\bal[-\s]?qaeda\b|\baqap\b|\baqim\b/i,
    /\bhezbollah\b|\bhizbollah\b|\bhizbullah\b/i,
    /\bhamas\b|\bislamic jihad\b/i,
    /\bhouthi(s)?\b|\bansar allah\b/i,
    /\bal[-\s]?shabaab\b|\bboko haram\b|\biswap\b/i,
    /\btaliban\b|\bttp\b|\bhaqqani\b/i,
    /\bjihad\w*\b|\bextremis\w+\b|\bradicali[sz]\w+\b/i,
    /\binsurgen\w+\b|\bmilitant(s)? group\b/i,
    /\bsuicide (bomb\w*|attack\w*)\b|\bcar bomb\b|\bied\b/i,
    /\bcounter[-\s]?terror\w*\b/i,
    /\bforeign terrorist organi[sz]ation\b|\bfto designation\b/i,
    /\bwagner group\b/i,
    /\bclaimed responsibility\b/i,
  ],
  iran_war: [
    /\birgc\b|\brevolutionary guard\b/i,
    /\bnatanz\b|\bfordow\b|\bisfahan nuclear\b|\bcentrifuge(s)?\b/i,
    /\bsnapback\b/i,
    /\bkhamenei\b/i,
    /\bstrait of hormuz\b/i,
  ],
  americas: [
    /\bmexic(o|an)\b|\bsheinbaum\b/i,
    /\bvenezuela(n)?\b|\bmaduro\b|\bcaracas\b/i,
    /\bcolombia(n)?\b|\bpetro\b/i,
    /\bbrazil(ian)?\b|\blula\b/i,
    /\bargentin(a|e)\b|\bmilei\b/i,
    /\bchile(an)?\b|\bperu(vian)?\b|\bbolivia(n)?\b|\becuador(ian)?\b/i,
    /\bcuba(n)?\b|\bhaiti(an)?\b|\bnicaragua(n)?\b/i,
    /\bhonduras\b|\bguatemala\b|\bel salvador\b|\bbukele\b/i,
    /\bpanama\b|\bcaribbean\b|\bcosta rica\b/i,
    /\blatin america(n)?\b|\bhemispher\w+\b|\bwestern hemisphere\b/i,
    /\borgani[sz]ation of american states\b|\boas\b|\bmercosur\b/i,
    /\bsouthern border\b|\brio grande\b|\bmigrant caravan\b/i,
  ],
  us_foreign_policy: [
    /\bwhite house\b|\bstate department\b|\bpentagon\b/i,
    /\bcongress\b|\bsenate\b|\bhouse (armed services|foreign affairs)\b/i,
    /\bwar powers\b|\bdefen[cs]e budget\b|\bndaa\b/i,
    /\bsecretary of (state|defen[cs]e)\b/i,
    /\bus (policy|posture|troops|aid|strategy|doctrine)\b|\bu\.s\. (policy|posture|troops|aid|strategy|doctrine)\b/i,
  ],
  emerging_fp: [
    /\bchina\b|\bchinese\b|\bbeijing\b|\btaiwan\b|\bxi jinping\b/i,
    /\brussia(n)?\b|\bmoscow\b|\bputin\b|\bukrain(e|ian)\b|\bkremlin\b/i,
    /\bnato\b|\beuropean union\b|\bbrussels\b|\bnordic\b|\bbaltic\b/i,
    /\bindia(n)?\b|\bnew delhi\b|\bmodi\b|\bpakistan(i)?\b/i,
    /\b(north|south) korea(n)?\b|\bpyongyang\b|\bseoul\b|\bjapan(ese)?\b|\btokyo\b/i,
    /\bbrics\b|\bde[-\s]?dollar\w*\b|\bswift\b/i,
    /\bsanction(s|ed|ing)?\b|\btariff(s)?\b|\bexport control(s)?\b/i,
    /\bsupply chain(s)?\b|\bsemiconductor(s)?\b|\brare earth(s)?\b/i,
    /\bnuclear (deal|talks|weapon|programme|program|arsenal|test)\b|\barms control\b/i,
    /\balliance\b|\btreaty\b|\bsummit\b|\bdiplomacy\b|\bdeterrence\b/i,
    /\bcyber(attack|security|warfare)?\b|\barctic\b|\bspace force\b/i,
    /\benergy security\b|\bopec\b|\bpipeline\b/i,
    /\bafrica(n)?\b|\bsahel\b|\bethiopia\b|\bsudan\b/i,
  ],
};

// Iran needs a topic word AND a conflict word — "Iran" alone (a Press TV
// business headline, say) must not consume an Iran-war slot.
const IRAN_SUBJECT = /\biran(ian|ians)?\b|\btehran\b/i;
const IRAN_CONFLICT =
  /\b(war|strike[sd]?|air ?strike|missile|drone|attack|retaliat\w+|escalat\w+|cease[-\s]?fire|truce|nuclear|enrich\w+|uranium|iaea|bomb\w*|military|conflict|israel\w*|deterrence)\b/i;

// Classification runs in this order; first bucket with a hit wins.
const PRECEDENCE = [
  "cartels_narcotics",
  "terrorism",
  IRAN_BUCKET,
  "americas",
  "us_foreign_policy",
  "emerging_fp",
];

function candidateText(row) {
  if (!row) return "";
  const title = String(row.title || "");
  // Body is a snippet only — enough to disambiguate, cheap to scan.
  const body = String(row.body_html || "").replace(/<[^>]*>/g, " ").slice(0, 600);
  return `${title} ${body}`.replace(/\s+/g, " ");
}

function scoreBucket(key, text) {
  if (key === IRAN_BUCKET) {
    let n = 0;
    for (const re of PATTERNS[IRAN_BUCKET]) if (re.test(text)) n++;
    // Explicit Iran markers (IRGC, Fordow, Khamenei...) are enough on their own.
    if (n > 0) return n + 1;
    if (IRAN_SUBJECT.test(text) && IRAN_CONFLICT.test(text)) return 1;
    return 0;
  }
  let n = 0;
  for (const re of PATTERNS[key] || []) if (re.test(text)) n++;
  return n;
}

/**
 * Classify one raw news row into a topic bucket.
 * Returns a bucket key, or null when nothing matches (the row is then only
 * usable as generic filler, never as a backfill for a required category).
 */
export function classifyCandidate(row) {
  const text = candidateText(row);
  if (!text.trim()) return null;

  const scores = {};
  for (const key of PRECEDENCE) scores[key] = scoreBucket(key, text);

  // Source region is a weak hint, never a decision on its own: it can only
  // break a tie for a bucket that already matched on content.
  const region = String((row && row.region_tag) || "").toUpperCase();
  if ((region === "MEX" || region === "VEN") && scores.americas > 0) scores.americas += 0.5;
  if (region === "IRI" && scores[IRAN_BUCKET] > 0) scores[IRAN_BUCKET] += 0.5;

  let best = null;
  let bestScore = 0;
  for (const key of PRECEDENCE) {
    // Strictly greater keeps PRECEDENCE as the tie-break.
    if (scores[key] > bestScore) {
      best = key;
      bestScore = scores[key];
    }
  }
  return bestScore > 0 ? best : null;
}

// Categories an Iran-war story could be quietly filed under to dodge the
// ceiling. Cartels and Americas are deliberately NOT here: "Venezuela buys
// Iranian drones" is honestly an Americas story, and the model's call stands.
const IRAN_ABSORBABLE = new Set(["emerging_fp", "us_foreign_policy", "terrorism"]);

/**
 * Settle the category of a model pick.
 *
 * The model's category is accepted when it is a real bucket — EXCEPT that a
 * story the classifier reads as the Iran war is counted as iran_war even when
 * the model filed it as emerging FP, US foreign policy or terrorism. The
 * ceiling is counted on what a story IS, not on which desk filed it; otherwise
 * "Iran nuclear talks" under emerging_fp is a sixth Iran item the cap never
 * sees. Terrorism keywords (Hezbollah, Houthis...) outrank Iran in the
 * classifier, so a genuine terrorism story is not pulled into the Iran count.
 *
 * `row` is { title, body_html, region_tag } — pass the model's own title
 * alongside the source headline so both are read.
 * Returns a bucket key, or null when neither side can place it.
 */
export function reconcileCategory(claimed, row) {
  const valid = isValidBucket(claimed) ? claimed : null;
  const cls = classifyCandidate(row);
  if (cls === IRAN_BUCKET && (!valid || IRAN_ABSORBABLE.has(valid))) return IRAN_BUCKET;
  return valid || cls || null;
}

// ---------------------------------------------------------------------------
// Candidate pool
// ---------------------------------------------------------------------------

/**
 * Build the candidate list handed to the model.
 *
 * The old pool was a flat `order by published_at desc limit 90`, which let
 * high-volume feeds (Press TV, Tehran Times, Times of Israel, the wires) crowd
 * out low-volume Americas and crime feeds (InSight Crime, Borderland Beat,
 * Caracas Chronicles, Reforma) before the model ever saw them. The SQL side now
 * caps rows per source; this function then reserves slots per required category
 * so every bucket reaches the prompt with enough candidates to actually fill
 * its minimum, and caps Iran so it cannot dominate the list.
 *
 * `rows` must already be ordered newest-first.
 */
export function buildCandidatePool(rows, opts = {}) {
  const limit = opts.limit || 200;
  const classified = (rows || []).map((row) => ({ row, bucket: classifyCandidate(row) }));

  const used = new Set();
  const picked = [];
  const take = (c) => {
    used.add(c.row.id);
    picked.push(c);
  };

  // 1) Reserve slots for every bucket with a pool guarantee, required ones
  //    first — these are the categories volume would otherwise bury.
  const ordered = [...BUCKETS].sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0));
  for (const b of ordered) {
    const want = opts.perBucketMin != null ? opts.perBucketMin : b.poolGuarantee;
    if (!want) continue;
    let n = 0;
    for (const c of classified) {
      if (n >= want || picked.length >= limit) break;
      if (used.has(c.row.id) || c.bucket !== b.key) continue;
      take(c);
      n++;
    }
  }

  // 2) Fill the remainder by recency, respecting each bucket's pool cap so a
  //    heavy news week on one topic cannot swamp the prompt.
  const counts = {};
  for (const c of picked) if (c.bucket) counts[c.bucket] = (counts[c.bucket] || 0) + 1;
  for (const c of classified) {
    if (picked.length >= limit) break;
    if (used.has(c.row.id)) continue;
    const def = c.bucket ? bucketDef(c.bucket) : null;
    if (def && def.poolCap && (counts[c.bucket] || 0) >= def.poolCap) continue;
    take(c);
    if (c.bucket) counts[c.bucket] = (counts[c.bucket] || 0) + 1;
  }

  return picked;
}

/** How many pool candidates exist per bucket — used for shortfall reporting. */
export function poolBucketCounts(pool) {
  const counts = {};
  for (const c of pool || []) if (c.bucket) counts[c.bucket] = (counts[c.bucket] || 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Post-selection enforcement — the authoritative pass
// ---------------------------------------------------------------------------

function countByBucket(items) {
  const counts = {};
  for (const key of BUCKET_KEYS) counts[key] = 0;
  for (const it of items) if (it.bucket) counts[it.bucket] = (counts[it.bucket] || 0) + 1;
  return counts;
}

/**
 * Enforce the topic quota on whatever the model returned.
 *
 * This is the guarantee. The prompt asks for the right shape; this makes it
 * true. It runs on every generation, including the heartbeat self-heal.
 *
 *   1. Drop Iran items beyond the ceiling of 5 (lowest-ranked go first).
 *   2. Drop items beyond any other bucket's hard ceiling.
 *   3. Backfill every required category up to its minimum from the candidate
 *      pool — using only candidates the classifier actually places in that
 *      category. A category with no qualifying candidate is recorded as a
 *      shortfall and left short. It is never padded.
 *   4. Trim back to 15 if over, taking from buckets that are above their
 *      minimum, lowest-ranked first.
 *   5. Top up to 15 if under, from any bucket EXCEPT Iran — the debrief never
 *      pads a thin week with extra Iran coverage.
 *   6. Re-rank 1..N.
 *
 * Returns { items, counts, shortfalls, dropped, total }.
 */
export function enforceQuotas(modelItems, pool, opts = {}) {
  const total = opts.total || TOTAL_ITEMS;
  const poolList = pool || [];

  // Normalise and order by the model's ranking.
  let items = (modelItems || [])
    .filter((it) => it && (it.title || it.source_row))
    .map((it, i) => ({
      ...it,
      bucket: isValidBucket(it.bucket) ? it.bucket : classifyCandidate(it.source_row) || null,
      rank: Number.isInteger(it.rank) ? it.rank : i + 1,
      origin: it.origin || "model",
    }));
  items.sort((a, b) => a.rank - b.rank);

  const dropped = [];
  const shortfalls = [];

  // --- 1 + 2) Hard ceilings, Iran first. -----------------------------------
  const seen = {};
  items = items.filter((it) => {
    const def = it.bucket ? bucketDef(it.bucket) : null;
    if (!def || def.max == null) return true;
    seen[it.bucket] = (seen[it.bucket] || 0) + 1;
    if (seen[it.bucket] <= def.max) return true;
    dropped.push({ ...it, dropped_because: `${it.bucket} over ceiling of ${def.max}` });
    return false;
  });

  // Track which pool rows are already on the page so backfill never repeats one.
  const usedRowIds = new Set();
  const usedTitles = new Set();
  for (const it of items) {
    if (it.source_row && it.source_row.id != null) usedRowIds.add(it.source_row.id);
    if (it.title) usedTitles.add(String(it.title).toLowerCase().trim());
  }

  const nextCandidate = (bucketKey) => {
    for (const c of poolList) {
      if (c.bucket !== bucketKey) continue;
      if (c.row.id != null && usedRowIds.has(c.row.id)) continue;
      const t = String(c.row.title || "").toLowerCase().trim();
      if (t && usedTitles.has(t)) continue;
      return c;
    }
    return null;
  };

  const adopt = (c, bucketKey) => {
    if (c.row.id != null) usedRowIds.add(c.row.id);
    const t = String(c.row.title || "").toLowerCase().trim();
    if (t) usedTitles.add(t);
    return {
      rank: items.length + 1,
      title: String(c.row.title || "Untitled event").slice(0, 400),
      summary: null,
      reasoning: null,
      bucket: bucketKey,
      source_row: c.row,
      origin: "backfill",
    };
  };

  // --- 3) Backfill required minimums. --------------------------------------
  for (const b of REQUIRED_BUCKETS) {
    let counts = countByBucket(items);
    while (counts[b.key] < b.min) {
      // Never exceed the edition size while backfilling; if we are already at
      // the cap, step 4 will free a slot from an over-quota bucket first.
      if (items.length >= total) {
        const freed = trimOne(items, dropped, b.key);
        if (!freed) break;
      }
      const c = nextCandidate(b.key);
      if (!c) break; // honest shortfall — recorded below
      items.push(adopt(c, b.key));
      counts = countByBucket(items);
    }
    const have = countByBucket(items)[b.key];
    if (have < b.min) {
      shortfalls.push({
        bucket: b.key,
        label: b.label,
        have,
        want: b.min,
        note:
          have === 0
            ? `${b.label.toLowerCase()}: 0 — no qualifying stories this week`
            : `${b.label.toLowerCase()}: ${have} of ${b.min} — only ${have} qualifying ${
                have === 1 ? "story" : "stories"
              } this week`,
      });
    }
  }

  // --- 4) Trim back to the edition size. -----------------------------------
  while (items.length > total) {
    if (!trimOne(items, dropped, null)) break;
  }

  // --- 5) Top up a thin week — never with Iran. ----------------------------
  //
  //     Iran is excluded outright: the rule is a ceiling, and a week short on
  //     terrorism or Americas coverage must never be quietly rounded out with
  //     more Iran. Remaining slots go to whichever eligible category is
  //     currently thinnest, so the filler spreads instead of piling into one.
  while (items.length < total) {
    const counts = countByBucket(items);
    let best = null;
    let bestCount = Infinity;
    for (const c of poolList) {
      if (!c.bucket || c.bucket === IRAN_BUCKET) continue;
      const def = bucketDef(c.bucket);
      if (def && def.max != null && counts[c.bucket] >= def.max) continue;
      if (c.row.id != null && usedRowIds.has(c.row.id)) continue;
      const t = String(c.row.title || "").toLowerCase().trim();
      if (t && usedTitles.has(t)) continue;
      if (counts[c.bucket] < bestCount) {
        best = c;
        bestCount = counts[c.bucket];
      }
    }
    if (!best) break;
    items.push(adopt(best, best.bucket));
  }
  if (items.length < total) {
    shortfalls.push({
      bucket: "_total",
      label: "Total",
      have: items.length,
      want: total,
      note: `total: ${items.length} of ${total} — the week's feeds did not carry ${total} qualifying stories`,
    });
  }

  // --- 6) Re-rank. ---------------------------------------------------------
  items.forEach((it, i) => {
    it.rank = i + 1;
  });

  return {
    items,
    counts: countByBucket(items),
    shortfalls,
    dropped,
    total: items.length,
  };
}

/**
 * Remove one item to free a slot. Takes the lowest-ranked item from the bucket
 * that is furthest above its minimum, so trimming never breaks a quota that is
 * already satisfied. `protectBucket` is never trimmed.
 */
function trimOne(items, dropped, protectBucket) {
  const counts = countByBucket(items);
  let worst = -1;
  let worstSlack = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it.bucket || it.bucket === protectBucket) continue;
    const def = bucketDef(it.bucket);
    const min = def ? def.min : 0;
    const slack = counts[it.bucket] - min;
    if (slack <= 0) continue;
    // Prefer the most over-quota bucket; within a bucket, the lowest rank.
    if (slack > worstSlack) {
      worstSlack = slack;
      worst = i;
    }
  }
  if (worst < 0) {
    // Everything is at its minimum — drop the lowest-ranked untagged item, or
    // the very last item, rather than looping forever.
    for (let i = items.length - 1; i >= 0; i--) {
      if (!items[i].bucket) {
        worst = i;
        break;
      }
    }
    if (worst < 0) worst = items.length - 1;
    if (worst < 0) return false;
  }
  const [removed] = items.splice(worst, 1);
  if (removed) dropped.push({ ...removed, dropped_because: "over edition size" });
  return !!removed;
}

// ---------------------------------------------------------------------------
// The split line printed at the top of the edition
// ---------------------------------------------------------------------------

/**
 * One-line per-category split, e.g.
 *   "15 items — Iran war 5 · Emerging foreign policy 3 · Terrorism 2 · …"
 * plus any honest shortfall, e.g. "terrorism: 0 — no qualifying stories this week".
 *
 * John's own test for drift: a debrief that cannot show its split has drifted.
 */
export function formatSplitLine(counts, shortfalls, totalOverride) {
  const c = counts || {};
  const total =
    totalOverride != null
      ? totalOverride
      : BUCKET_KEYS.reduce((n, k) => n + (c[k] || 0), 0);
  const parts = BUCKETS.map((b) => `${b.label} ${c[b.key] || 0}`);
  let line = `${total} items — ${parts.join(" · ")}`;
  const notes = (shortfalls || []).map((s) => s.note).filter(Boolean);
  if (notes.length) line += ` — ${notes.join("; ")}`;
  return line;
}

/**
 * Does a finished edition satisfy the locked rule? Used by the guard test and
 * available to any audit that wants a yes/no.
 */
export function validateEdition(counts, shortfalls, total) {
  const c = counts || {};
  const problems = [];
  if ((c[IRAN_BUCKET] || 0) > IRAN_MAX) {
    problems.push(`Iran ceiling breached: ${c[IRAN_BUCKET]} > ${IRAN_MAX}`);
  }
  const declared = new Set((shortfalls || []).map((s) => s.bucket));
  for (const b of REQUIRED_BUCKETS) {
    if ((c[b.key] || 0) < b.min && !declared.has(b.key)) {
      problems.push(`${b.key} below minimum ${b.min} with no declared shortfall`);
    }
  }
  if (total != null && total > TOTAL_ITEMS) {
    problems.push(`edition over size: ${total} > ${TOTAL_ITEMS}`);
  }
  if (total != null && total < TOTAL_ITEMS && !declared.has("_total")) {
    problems.push(`edition under size (${total}) with no declared shortfall`);
  }
  return { ok: problems.length === 0, problems };
}
