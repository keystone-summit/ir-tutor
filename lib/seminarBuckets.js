// Single source of truth for the Weekly Briefing's size and its region quota.
//
// This used to live in two places that drifted apart: the generator
// (app/api/seminar/generate/route.js) owned the bucket keys and the prompt
// text, and the reader (app/seminar/SeminarView.jsx) kept its own copy of the
// key→label map plus a hardcoded "/5 regions" score. Both now import from here
// so a bucket can never exist on one side and not the other.
//
// Client-safe: plain constants, no node built-ins, no fs, no db.
//
// TWO AXES. Regions (below) are the PRESENTATION axis: every event carries one,
// and the reader's "Regional balance" strip shows them. The topic quota in
// lib/seminarQuota.js is the ENFORCEMENT axis: John's locked rule (15 items,
// Iran war <= 5, minimums for emerging FP / terrorism / cartels / Americas) is
// applied on it after the model returns, whatever the regions look like.
import { TOTAL_ITEMS } from "./seminarQuota";

// How many events the weekly pipeline selects. Owned by the quota module so
// the two can never disagree.
export const SEMINAR_EVENT_TARGET = TOTAL_ITEMS;

// Display order of the region buckets. Order drives the coverage strip.
export const REGION_BUCKETS = [
  ["middle_east", "Middle East"],
  ["europe_russia", "Europe / Russia"],
  ["asia", "Asia"],
  ["south_asia", "South Asia"],
  ["americas", "Americas"],
  ["africa", "Africa"],
  ["brics_trade", "BRICS-trade"],
  ["global_institutions", "Global institutions"],
];

export const REGION_BUCKET_KEYS = REGION_BUCKETS.map(([k]) => k);
export const REGION_BUCKET_LABEL = Object.fromEntries(REGION_BUCKETS);

// What each bucket means, for the selector prompt.
export const BUCKET_DESC = {
  middle_east: "Middle East: Iran, Israel, the Gulf, the Levant, Red Sea / Houthis, Syria, Iraq",
  europe_russia: "Europe & Russia: EU, NATO, Ukraine, Russia, European defence and migration politics",
  asia: "East & Southeast Asia: China, Taiwan, Korea, Japan, ASEAN, the South China Sea",
  south_asia: "South Asia: India, Pakistan, Bangladesh, Afghanistan, Sri Lanka, the Indian Ocean",
  americas: "Americas: US domestic-foreign policy, Latin America, Mexico/cartels, Venezuela, Cuba, Brazil",
  africa: "Africa: the Sahel, Horn of Africa, Nigeria, Sudan, DRC, North Africa, African security and basing",
  brics_trade: "BRICS / global trade & geoeconomics: de-dollarization, sanctions, tariffs, SWIFT, chips, energy and supply chains",
  global_institutions:
    "Global institutions & transnational: UN and Security Council, ICC/ICJ, NATO and G7/G20 summitry, arms control and nuclear regimes, climate and pandemic governance, cyber and space norms",
};

// The selector runs as three CONCURRENT Claude calls ("desks") rather than one
// call asking for all fifteen.
//
// Latency, measured: a single 15-event call over a 240-item candidate list took
// ~63s wall (2,885 output tokens), over the 60s Vercel function cap. Three
// parallel calls of ~1,100 output tokens each land around 25-35s.
//
// The desks are split by TOPIC — the quota axis — not by region. That is what
// guarantees John's required categories reach the model with their own desk:
// the cartel story competes with other cartel and Americas stories rather than
// with the week's Iran coverage, and the Iran desk is the only one allowed to
// file iran_war at all. Each desk still tags every pick with a REGION (above)
// for the reader's regional-balance strip.
//
// The buckets are the topic keys from lib/seminarQuota. Each desk is walked
// best-per-bucket first by mergeDeskPicks, so its floor covers every bucket it
// owns before score takes over. Floors are sized off the quota minimums:
//   iran_terror  : terrorism min 2 (+ Iran up to its ceiling of 5)
//   americas     : cartels_narcotics min 2 + americas min 2 = 4
//   world        : emerging_fp min 3 (+ us_foreign_policy, capped at 2)
// `ask` > `floor` so the near-duplicate filter has spares, and so a desk hands
// enforceQuotas real model-written leftovers to backfill from before it ever
// has to reach for a raw feed row.
export const SELECTION_GROUPS = [
  {
    key: "iran_terror",
    label: "Iran war / terrorism",
    buckets: ["iran_war", "terrorism"],
    ask: 8,
    floor: 5,
  },
  {
    key: "americas",
    label: "Cartels & narcotics / relations in the Americas",
    buckets: ["cartels_narcotics", "americas"],
    ask: 7,
    floor: 4,
  },
  {
    key: "world",
    label: "Emerging foreign policy / US foreign policy",
    buckets: ["emerging_fp", "us_foreign_policy"],
    ask: 7,
    floor: 4,
  },
];

// Each desk is guaranteed its first `floor` picks (when the week's news
// supports that many); the remaining slots go to the highest-consequence
// leftovers from any desk. 5 + 4 + 4 = 13 guaranteed + 2 open = 15.
export const OPEN_SLOTS =
  SEMINAR_EVENT_TARGET - SELECTION_GROUPS.reduce((n, g) => n + g.floor, 0);

// Best-guess region for a raw feed row the enforcer had to backfill (model
// picks carry their own region). Keyed off the feed's region tag; a US /
// wire / think-tank feed has no home region, so the topic decides — a cartel
// or Americas story is an Americas story.
const TAG_REGION = {
  IRI: "middle_east", ISR: "middle_east", QAT: "middle_east",
  RUS: "europe_russia", EU: "europe_russia", UK: "europe_russia",
  PRC: "asia", JPN: "asia",
  IND: "south_asia", PAK: "south_asia", SAS: "south_asia",
  MEX: "americas", VEN: "americas",
  AFR: "africa",
  UN: "global_institutions",
};
export function regionForRow(row, topic) {
  const tag = String((row && row.region_tag) || "").toUpperCase();
  if (TAG_REGION[tag]) return TAG_REGION[tag];
  if (topic === "cartels_narcotics" || topic === "americas") return "americas";
  if (topic === "iran_war") return "middle_east";
  return null;
}
