// Curated multi-source feed list for the FP Implications Seminar.
//
// Each source is tagged with a region, a "worldview" so the reader can see the
// same event framed by different national presses, and a TIER. RSS is the
// primary fetch path; a source that blocks or has no working feed is simply
// skipped at ingest time (logged, never fatal) per the cost-discipline rule.
//
// region codes: US, UK, PRC, IRI (Iran), QAT (Qatar), RUS, ISR (Israel),
//   EU, INTL (wire/multilateral), NGO (think-tank / OSINT),
//   LAC (Latin America research institution)
//
// ---------------------------------------------------------------------------
// TIERS — added 2026-09-21 on John's instruction ("giving them more weight
// than news feeds").
//
//   news     — wires, national presses, the FP trade press. Publishes hourly.
//   analysis — think tanks and research institutions. Publishes weekly or
//              monthly. This is the layer governments, oil majors and
//              institutional money actually read.
//
// The tier is a PROPERTY OF THE FEED, never a hardcoded list inside the
// selection logic: add a feed with tier "analysis" here and the pipeline
// weights it automatically. Two things key off it downstream
// (lib/seminarQuota.js + app/api/seminar/generate/route.js):
//
//   1. WEIGHT. Analysis rows carry a recency bonus in the candidate pool, so a
//      Chatham House piece from four days ago outranks a wire story from four
//      hours ago. Under the old flat recency sort they were buried by wire copy
//      every single week — which is the whole reason for the change.
//   2. LOOKBACK. Analysis is read back 28 days, news 9 days. A weekly think-tank
//      piece would otherwise never survive a news-sized window.
//
// We deliberately favour sources with reliable public RSS. Paywalled outlets
// (FT, WSJ, Economist, Haaretz, Bloomberg) still publish headline RSS; we ingest
// the headline + snippet only.
//
// EVERY URL BELOW WAS FETCHED AND CONFIRMED to return valid RSS/Atom with at
// least one item. Organisations John asked for that have NO usable public feed
// are listed in NO_FEED_FOUND at the bottom rather than silently dropped.

export const SEMINAR_FEEDS = [
  // ==== TIER: NEWS ==========================================================

  // ---- Wire services / agencies ----
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", region: "UK", worldview: "UK public broadcaster", tier: "news" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", region: "QAT", worldview: "Qatari / Global South", tier: "news" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", region: "US", worldview: "US liberal establishment", tier: "news" },
  { name: "Washington Post World", url: "https://feeds.washingtonpost.com/rss/world", region: "US", worldview: "US liberal establishment", tier: "news" },
  { name: "WSJ World", url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml", region: "US", worldview: "US business / center-right", tier: "news" },
  { name: "Reuters World (GN)", url: "https://news.google.com/rss/search?q=when:7d+world+foreign+policy+source:reuters&hl=en-US&gl=US&ceid=US:en", region: "INTL", worldview: "wire (via Google News)", tier: "news" },
  { name: "AP World (GN)", url: "https://news.google.com/rss/search?q=when:7d+foreign+policy+source:apnews.com&hl=en-US&gl=US&ceid=US:en", region: "INTL", worldview: "wire (via Google News)", tier: "news" },
  { name: "AFP (GN)", url: "https://news.google.com/rss/search?q=when:7d+diplomacy+source:%22AFP%22&hl=en-US&gl=US&ceid=US:en", region: "INTL", worldview: "wire (via Google News)", tier: "news" },

  // ---- FP-specialist press ----
  //      Deliberately still "news": these publish daily and compete on recency
  //      with the wires. The analysis tier is reserved for research institutions.
  { name: "Foreign Policy", url: "https://foreignpolicy.com/feed/", region: "US", worldview: "FP-specialist", tier: "news" },
  { name: "Foreign Affairs", url: "https://www.foreignaffairs.com/rss.xml", region: "US", worldview: "FP-establishment (CFR)", tier: "news" },
  { name: "The Diplomat", url: "https://thediplomat.com/feed/", region: "INTL", worldview: "Asia-Pacific focus", tier: "news" },
  { name: "War on the Rocks", url: "https://warontherocks.com/feed/", region: "US", worldview: "US defense / strategy", tier: "news" },
  { name: "Lawfare", url: "https://www.lawfaremedia.org/feed/", region: "US", worldview: "US national-security law", tier: "news" },
  { name: "Responsible Statecraft (Quincy)", url: "https://responsiblestatecraft.org/feed/", region: "US", worldview: "restraint / Quincy Institute", tier: "news" },
  { name: "Geopolitical Futures", url: "https://geopoliticalfutures.com/feed/", region: "US", worldview: "geopolitical forecasting", tier: "news" },

  // ---- Financial / markets ----
  { name: "FT World (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Financial+Times%22+geopolitics&hl=en-US&gl=US&ceid=US:en", region: "UK", worldview: "UK financial establishment", tier: "news" },
  { name: "Economist Intl (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22The+Economist%22+international&hl=en-US&gl=US&ceid=US:en", region: "UK", worldview: "liberal-internationalist", tier: "news" },
  { name: "Bloomberg (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Bloomberg%22+geopolitics&hl=en-US&gl=US&ceid=US:en", region: "US", worldview: "US markets", tier: "news" },

  // ---- Region-of-interest national presses ----
  { name: "Global Times", url: "https://news.google.com/rss/search?q=when:7d+source:%22Global+Times%22&hl=en-US&gl=US&ceid=US:en", region: "PRC", worldview: "PRC state-aligned", tier: "news" },
  { name: "South China Morning Post", url: "https://www.scmp.com/rss/91/feed", region: "PRC", worldview: "Hong Kong / PRC-adjacent", tier: "news" },
  { name: "Tehran Times", url: "https://www.tehrantimes.com/rss", region: "IRI", worldview: "Iranian state-aligned", tier: "news" },
  { name: "Press TV", url: "https://www.presstv.ir/rss.xml", region: "IRI", worldview: "Iranian state", tier: "news" },
  { name: "TASS", url: "https://tass.com/rss/v2.xml", region: "RUS", worldview: "Russian state", tier: "news" },
  { name: "Times of Israel", url: "https://www.timesofisrael.com/feed/", region: "ISR", worldview: "Israeli centrist", tier: "news" },
  { name: "Haaretz (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Haaretz%22&hl=en-US&gl=US&ceid=US:en", region: "ISR", worldview: "Israeli left-liberal", tier: "news" },

  // ---- Americas / Mexico-Venezuela / cross-border crime (Phase 3.5) ----
  { name: "Reforma (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Reforma%22+Mexico&hl=en-US&gl=US&ceid=US:en", region: "MEX", worldview: "Mexican center-right daily", tier: "news" },
  { name: "El Universal (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22El+Universal%22+Mexico&hl=en-US&gl=US&ceid=US:en", region: "MEX", worldview: "Mexican daily of record", tier: "news" },
  { name: "Caracas Chronicles", url: "https://www.caracaschronicles.com/feed/", region: "VEN", worldview: "Venezuelan opposition-aligned", tier: "news" },
  { name: "InSight Crime", url: "https://insightcrime.org/feed/", region: "INTL", worldview: "organized-crime investigation", tier: "news" },
  { name: "Borderland Beat", url: "https://www.borderlandbeat.com/feeds/posts/default?alt=rss", region: "MEX", worldview: "US-Mexico border / cartels OSINT", tier: "news" },

  // ---- Asia (India hedge + China financial press) (Phase 3.5) ----
  { name: "Hindustan Times World", url: "https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml", region: "IND", worldview: "Indian mainstream daily", tier: "news" },
  { name: "Caixin (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Caixin%22&hl=en-US&gl=US&ceid=US:en", region: "PRC", worldview: "Chinese financial / markets press", tier: "news" },

  // ---- Russia incl. dissident / exile press (Phase 3.5; TASS already above) ----
  { name: "RT", url: "https://www.rt.com/rss/news/", region: "RUS", worldview: "Russian state broadcaster", tier: "news" },
  { name: "Meduza (English)", url: "https://meduza.io/rss/en/all", region: "RUS", worldview: "Russian dissident / exile press", tier: "news" },

  // ---- Africa (Phase 4 — the `africa` quota bucket had no dedicated source
  //      and was reported underweighted every week as a result) ----
  { name: "Africanews", url: "https://www.africanews.com/feed/rss", region: "AFR", worldview: "pan-African broadcaster", tier: "news" },
  { name: "Africa security (GN)", url: "https://news.google.com/rss/search?q=when:7d+Sahel+OR+%22Horn+of+Africa%22+OR+Nigeria+OR+Sudan+OR+Congo+security+OR+coup+OR+militants&hl=en-US&gl=US&ceid=US:en", region: "AFR", worldview: "Africa security wire (via Google News)", tier: "news" },

  // ---- South Asia (Phase 4; Hindustan Times already above) ----
  { name: "Dawn (Pakistan)", url: "https://www.dawn.com/feeds/home", region: "PAK", worldview: "Pakistani daily of record", tier: "news" },
  { name: "South Asia (GN)", url: "https://news.google.com/rss/search?q=when:7d+India+OR+Pakistan+OR+Bangladesh+OR+Afghanistan+foreign+policy+OR+border+OR+military&hl=en-US&gl=US&ceid=US:en", region: "SAS", worldview: "South Asia wire (via Google News)", tier: "news" },

  // ---- Global institutions / multilateral (Phase 4) ----
  { name: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", region: "UN", worldview: "United Nations", tier: "news" },
  { name: "Multilateral (GN)", url: "https://news.google.com/rss/search?q=when:7d+%22United+Nations%22+OR+%22Security+Council%22+OR+NATO+summit+OR+%22G7%22+OR+%22ICC%22+resolution&hl=en-US&gl=US&ceid=US:en", region: "UN", worldview: "multilateral wire (via Google News)", tier: "news" },

  // ---- Asia (financial / regional business press) ----
  { name: "Nikkei Asia (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Nikkei+Asia%22&hl=en-US&gl=US&ceid=US:en", region: "JPN", worldview: "Japanese financial press", tier: "news" },

  // ==== TIER: ANALYSIS ======================================================
  // Think tanks and research institutions. Weighted ABOVE the news tier in the
  // candidate pool and read back 28 days instead of 9.

  // ---- Establishment foreign policy ----
  { name: "Brookings", url: "https://www.brookings.edu/feed/", region: "NGO", worldview: "center-left think tank", tier: "analysis" },
  { name: "Atlantic Council", url: "https://www.atlanticcouncil.org/feed/", region: "NGO", worldview: "Atlanticist think tank", tier: "analysis" },
  // Carnegie's legacy Solr RSS endpoint did not survive their site rebuild and
  // now returns HTML. Left in place because ingest skips a dead feed harmlessly;
  // Carnegie publishes no replacement public feed (checked 2026-09-21).
  { name: "Carnegie Endowment", url: "https://carnegieendowment.org/rss/solr?maxrow=20", region: "NGO", worldview: "liberal-internationalist think tank", tier: "analysis" },
  { name: "FDD", url: "https://www.fdd.org/feed/", region: "NGO", worldview: "hawkish / defense of democracies", tier: "analysis" },
  { name: "Heritage Foundation", url: "https://www.heritage.org/rss", region: "NGO", worldview: "US conservative", tier: "analysis" },
  // Was cfr.org/rss/expert-briefs.xml, which now returns an empty body. The
  // site-wide feed is live and broader.
  { name: "CFR", url: "https://www.cfr.org/feed", region: "NGO", worldview: "FP-establishment (CFR)", tier: "analysis" },
  { name: "Chatham House", url: "https://www.chathamhouse.org/path/whatsnew.xml", region: "NGO", worldview: "UK FP-establishment (RIIA)", tier: "analysis" },
  { name: "RAND", url: "https://www.rand.org/pubs/commentary.xml", region: "NGO", worldview: "US federally-funded research", tier: "analysis" },
  { name: "SIPRI", url: "https://www.sipri.org/rss/combined.xml", region: "NGO", worldview: "arms, conflict & disarmament research", tier: "analysis" },
  { name: "Bellingcat", url: "https://www.bellingcat.com/feed/", region: "NGO", worldview: "open-source investigation", tier: "analysis" },

  // ---- Americas / cartels / narcotics (John's thinnest area) ----
  { name: "Crisis Group — Latin America", url: "https://www.crisisgroup.org/rss/73", region: "LAC", worldview: "conflict-prevention NGO (LatAm desk)", tier: "analysis" },
  { name: "GI-TOC", url: "https://globalinitiative.net/feed/", region: "NGO", worldview: "transnational organised crime research", tier: "analysis" },
  { name: "Igarapé Institute", url: "https://igarape.org.br/en/feed/", region: "LAC", worldview: "Brazilian security & development research", tier: "analysis" },
  { name: "México Evalúa", url: "https://www.mexicoevalua.org/feed/", region: "LAC", worldview: "Mexican public-policy research", tier: "analysis" },

  // ---- Terrorism (the debrief had no dedicated source at all before this) ----
  { name: "Jamestown Foundation", url: "https://jamestown.org/feed/", region: "NGO", worldview: "terrorism & Eurasia monitoring", tier: "analysis" },
  { name: "ICCT The Hague", url: "https://icct.nl/rss.xml", region: "NGO", worldview: "counter-terrorism research", tier: "analysis" },
  { name: "Long War Journal", url: "https://www.longwarjournal.org/feed", region: "NGO", worldview: "jihadist-movement tracking (FDD)", tier: "analysis" },
  { name: "Soufan Center", url: "https://thesoufancenter.org/feed/", region: "NGO", worldview: "security & intelligence analysis", tier: "analysis" },

  // ---- Emerging issues / China / Asia ----
  { name: "MERICS", url: "https://merics.org/en/rss", region: "NGO", worldview: "European China research", tier: "analysis" },
  { name: "ASPI", url: "https://www.aspi.org.au/feed/", region: "NGO", worldview: "Australian strategic policy", tier: "analysis" },
  { name: "ASPI The Strategist", url: "https://www.aspistrategist.org.au/feed/", region: "NGO", worldview: "Australian strategic commentary", tier: "analysis" },
  { name: "Lowy Interpreter", url: "https://www.lowyinstitute.org/the-interpreter/rss.xml", region: "NGO", worldview: "Australian / Indo-Pacific research", tier: "analysis" },
  // Low-volume by design — a few substantial China-economy pieces a quarter.
  { name: "Rhodium Group", url: "https://rhg.com/feed/", region: "NGO", worldview: "China economic research", tier: "analysis" },

  // ---- Energy (what the oil majors read) ----
  { name: "EIA Today in Energy", url: "https://www.eia.gov/rss/todayinenergy.xml", region: "US", worldview: "US official energy statistics", tier: "analysis" },
  { name: "Baker Institute", url: "https://www.bakerinstitute.org/rss.xml", region: "NGO", worldview: "energy & public policy research", tier: "analysis" },

  // ---- Conflict data / early warning ----
  { name: "Crisis Group", url: "https://www.crisisgroup.org/rss.xml", region: "NGO", worldview: "conflict early warning", tier: "analysis" },
];

// Organisations John asked for that have NO usable public RSS/Atom feed as of
// 2026-09-21. Recorded so nobody re-researches them from scratch, and so a
// future check can be a one-line re-test rather than a fresh hunt.
export const NO_FEED_FOUND = [
  { name: "WOLA", reason: "WordPress /feed/ exists but is bot-blocked at the edge (403 nginx) for server-side fetchers." },
  { name: "Wilson Center Mexico Institute", reason: "Site publishes no RSS anywhere; no alternate link in the DOM." },
  { name: "Americas Society / Council of the Americas", reason: "rss.xml is valid but carries 2 stale items (newest Mar 2025) — not a news feed." },
  { name: "CTC Sentinel (West Point)", reason: "All feed paths redirect to a FeedBurner address that now serves a parked page." },
  { name: "ICSR (King's College London)", reason: "Feed is valid XML but has not updated since Jul 2025." },
  { name: "Carnegie (China / Politika)", reason: "Legacy Solr feeds removed in the site rebuild; no public feed on the current site." },
  { name: "IISS", reason: "No public RSS/Atom endpoint found." },
  { name: "CSIS", reason: "rss.xml is valid but its newest item is from Mar 2016 — effectively dead." },
  { name: "International Energy Agency", reason: "Entire site behind a Cloudflare bot challenge; no feed reachable by a server." },
  { name: "Oxford Institute for Energy Studies", reason: "Cloudflare bot challenge — unverifiable rather than proven absent." },
  { name: "ACLED", reason: "No feed; all candidate paths return real 404s and the DOM advertises none." },
  { name: "Crisis Group CrisisWatch (dedicated)", reason: "No CrisisWatch-only feed; the general Crisis Group feed is in use instead." },
  { name: "Brookings (foreign policy only)", reason: "No topic-scoped feed; the site-wide Brookings feed is in use instead." },
];

// ---------------------------------------------------------------------------
// Tier helpers
// ---------------------------------------------------------------------------

export const ANALYSIS_TIER = "analysis";
export const NEWS_TIER = "news";

/** A feed's tier, defaulting to news so an untagged feed can never be promoted. */
export function feedTier(feed) {
  return feed && feed.tier === ANALYSIS_TIER ? ANALYSIS_TIER : NEWS_TIER;
}

/**
 * Source NAMES in the analysis tier, derived from SEMINAR_FEEDS at runtime.
 *
 * seminar_news_raw stores `source` (the feed's name) but has no tier column, so
 * the generator's SQL resolves the tier by matching against this array. Derived,
 * never hand-maintained: add an analysis feed above and it inherits the
 * weighting and the wider lookback with no other edit.
 */
export const ANALYSIS_SOURCE_NAMES = SEMINAR_FEEDS
  .filter((f) => feedTier(f) === ANALYSIS_TIER)
  .map((f) => f.name);

/**
 * How far back each tier is read.
 *
 * news 9 days: the brief is weekly (Monday), so 7 days plus two days of slack
 * for feed lag and items whose published_at trails their appearance. Nothing
 * falls between editions.
 *
 * analysis 28 days: think tanks publish weekly to monthly. Under a news-sized
 * window a monthly piece could never qualify, which would make the analysis
 * tier decorative.
 */
export const TIER_LOOKBACK_DAYS = {
  [NEWS_TIER]: 9,
  [ANALYSIS_TIER]: 28,
};

// Map a region code to a display label.
export const REGION_LABEL = {
  US: "United States", UK: "United Kingdom", PRC: "China", IRI: "Iran",
  QAT: "Qatar", RUS: "Russia", ISR: "Israel", EU: "Europe",
  INTL: "International wire", NGO: "Think-tank / OSINT",
  MEX: "Mexico", VEN: "Venezuela", IND: "India",
  AFR: "Africa", PAK: "Pakistan", SAS: "South Asia", UN: "United Nations", JPN: "Japan",
  LAC: "Latin America (research)",
};
