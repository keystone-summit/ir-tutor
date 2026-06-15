// Curated multi-source feed list for the FP Implications Seminar.
//
// Each source is tagged with a region and a "worldview" so the reader can
// see the same event framed by different national presses. RSS is the
// primary fetch path; a source that blocks or has no working feed is simply
// skipped at ingest time (logged, never fatal) per the cost-discipline rule.
//
// region codes: US, UK, PRC, IRI (Iran), QAT (Qatar), RUS, ISR (Israel),
//   EU, INTL (wire/multilateral), NGO (think-tank / OSINT)
//
// We deliberately favour sources with reliable public RSS. Paywalled
// outlets (FT, WSJ, Economist, Haaretz, Bloomberg) still publish headline
// RSS; we ingest the headline + snippet only.

export const SEMINAR_FEEDS = [
  // ---- Wire services / agencies ----
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", region: "UK", worldview: "UK public broadcaster" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", region: "QAT", worldview: "Qatari / Global South" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", region: "US", worldview: "US liberal establishment" },
  { name: "Washington Post World", url: "https://feeds.washingtonpost.com/rss/world", region: "US", worldview: "US liberal establishment" },
  { name: "WSJ World", url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml", region: "US", worldview: "US business / center-right" },
  { name: "Reuters World (GN)", url: "https://news.google.com/rss/search?q=when:7d+world+foreign+policy+source:reuters&hl=en-US&gl=US&ceid=US:en", region: "INTL", worldview: "wire (via Google News)" },
  { name: "AP World (GN)", url: "https://news.google.com/rss/search?q=when:7d+foreign+policy+source:apnews.com&hl=en-US&gl=US&ceid=US:en", region: "INTL", worldview: "wire (via Google News)" },
  { name: "AFP (GN)", url: "https://news.google.com/rss/search?q=when:7d+diplomacy+source:%22AFP%22&hl=en-US&gl=US&ceid=US:en", region: "INTL", worldview: "wire (via Google News)" },

  // ---- FP-specialist press ----
  { name: "Foreign Policy", url: "https://foreignpolicy.com/feed/", region: "US", worldview: "FP-specialist" },
  { name: "Foreign Affairs", url: "https://www.foreignaffairs.com/rss.xml", region: "US", worldview: "FP-establishment (CFR)" },
  { name: "The Diplomat", url: "https://thediplomat.com/feed/", region: "INTL", worldview: "Asia-Pacific focus" },
  { name: "War on the Rocks", url: "https://warontherocks.com/feed/", region: "US", worldview: "US defense / strategy" },
  { name: "Lawfare", url: "https://www.lawfaremedia.org/feed/", region: "US", worldview: "US national-security law" },
  { name: "Responsible Statecraft (Quincy)", url: "https://responsiblestatecraft.org/feed/", region: "US", worldview: "restraint / Quincy Institute" },
  { name: "Geopolitical Futures", url: "https://geopoliticalfutures.com/feed/", region: "US", worldview: "geopolitical forecasting" },

  // ---- Financial / markets ----
  { name: "FT World (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Financial+Times%22+geopolitics&hl=en-US&gl=US&ceid=US:en", region: "UK", worldview: "UK financial establishment" },
  { name: "Economist Intl (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22The+Economist%22+international&hl=en-US&gl=US&ceid=US:en", region: "UK", worldview: "liberal-internationalist" },
  { name: "Bloomberg (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Bloomberg%22+geopolitics&hl=en-US&gl=US&ceid=US:en", region: "US", worldview: "US markets" },

  // ---- Region-of-interest national presses ----
  { name: "Global Times", url: "https://news.google.com/rss/search?q=when:7d+source:%22Global+Times%22&hl=en-US&gl=US&ceid=US:en", region: "PRC", worldview: "PRC state-aligned" },
  { name: "South China Morning Post", url: "https://www.scmp.com/rss/91/feed", region: "PRC", worldview: "Hong Kong / PRC-adjacent" },
  { name: "Tehran Times", url: "https://www.tehrantimes.com/rss", region: "IRI", worldview: "Iranian state-aligned" },
  { name: "Press TV", url: "https://www.presstv.ir/rss.xml", region: "IRI", worldview: "Iranian state" },
  { name: "TASS", url: "https://tass.com/rss/v2.xml", region: "RUS", worldview: "Russian state" },
  { name: "Times of Israel", url: "https://www.timesofisrael.com/feed/", region: "ISR", worldview: "Israeli centrist" },
  { name: "Haaretz (GN)", url: "https://news.google.com/rss/search?q=when:7d+source:%22Haaretz%22&hl=en-US&gl=US&ceid=US:en", region: "ISR", worldview: "Israeli left-liberal" },

  // ---- Think tanks / research / OSINT ----
  { name: "Brookings", url: "https://www.brookings.edu/feed/", region: "NGO", worldview: "center-left think tank" },
  { name: "Atlantic Council", url: "https://www.atlanticcouncil.org/feed/", region: "NGO", worldview: "Atlanticist think tank" },
  { name: "Carnegie Endowment", url: "https://carnegieendowment.org/rss/solr?maxrow=20", region: "NGO", worldview: "liberal-internationalist think tank" },
  { name: "FDD", url: "https://www.fdd.org/feed/", region: "NGO", worldview: "hawkish / defense of democracies" },
  { name: "Heritage Foundation", url: "https://www.heritage.org/rss", region: "NGO", worldview: "US conservative" },
  { name: "CFR Expert Briefs", url: "https://www.cfr.org/rss/expert-briefs.xml", region: "NGO", worldview: "FP-establishment (CFR)" },
  { name: "Bellingcat", url: "https://www.bellingcat.com/feed/", region: "NGO", worldview: "open-source investigation" },
];

// Map a region code to a display label.
export const REGION_LABEL = {
  US: "United States", UK: "United Kingdom", PRC: "China", IRI: "Iran",
  QAT: "Qatar", RUS: "Russia", ISR: "Israel", EU: "Europe",
  INTL: "International wire", NGO: "Think-tank / OSINT",
};
