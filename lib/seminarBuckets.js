// Single source of truth for the Weekly Briefing's size and its region quota.
//
// This used to live in two places that drifted apart: the generator
// (app/api/seminar/generate/route.js) owned the bucket keys and the prompt
// text, and the reader (app/seminar/SeminarView.jsx) kept its own copy of the
// key→label map plus a hardcoded "/5 regions" score. Both now import from here
// so a bucket can never exist on one side and not the other.
//
// Client-safe: plain constants, no node built-ins, no fs, no db.

// How many events the weekly pipeline selects. The briefing used to be five —
// one per region — which was too thin to read the world off. Fifteen, spread
// over eight buckets, is the target.
export const SEMINAR_EVENT_TARGET = 15;

// Display order of the quota buckets. Order drives the coverage strip.
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

// The selector runs as three CONCURRENT Claude calls over disjoint bucket
// groups rather than one call asking for all fifteen.
//
// Two reasons, both measured:
//   1. Latency. A single 15-event call over a 240-item candidate list took
//      ~63s wall (2,885 output tokens) — over the 60s Vercel function cap that
//      already forced the Deep Dive into its own request. Three parallel calls
//      of ~1,100 output tokens each land around 25-35s.
//   2. Breadth, which is the point of the change. That same single call spent
//      its fifteen slots on 5 Middle East / 4 Europe-Russia / 3 Asia / 2
//      Americas / 1 BRICS and reported Africa, South Asia and global
//      institutions as underweighted — the loudest region crowds out the rest
//      when one prompt ranks the whole world at once. Giving each group its own
//      call means the Africa story competes with other Africa stories.
//
// Buckets are disjoint across groups, but that does NOT make the picks
// disjoint: a Saudi-Turkey-Pakistan defence pact is honestly Middle East and
// honestly South Asia, and two desks writing their own titles off different
// wire copy produced "Mecca Joint Defense Pact" and "Makkah Joint Defense
// Pact" on the first run. Hence `ask` > `floor` — each desk brings spares so
// the near-duplicate filter in generate/route.js has something to fall back on
// without leaving the briefing short.
export const SELECTION_GROUPS = [
  {
    key: "conflict",
    label: "Middle East / Europe-Russia",
    buckets: ["middle_east", "europe_russia"],
    ask: 7,
    floor: 4,
  },
  {
    key: "indo_pacific_americas",
    label: "Asia / South Asia / Americas",
    buckets: ["asia", "south_asia", "americas"],
    ask: 7,
    floor: 4,
  },
  {
    key: "global",
    label: "Africa / BRICS-trade / global institutions",
    buckets: ["africa", "brics_trade", "global_institutions"],
    ask: 7,
    floor: 4,
  },
];

// Each group is guaranteed its first `floor` picks (when the week's news
// supports that many); the remaining slots go to the highest-consequence
// leftovers from any group. 3 × 4 = 12 guaranteed + 3 open = 15.
export const OPEN_SLOTS =
  SEMINAR_EVENT_TARGET - SELECTION_GROUPS.reduce((n, g) => n + g.floor, 0);
