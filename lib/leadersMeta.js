// lib/leadersMeta.js — Pure-data helpers safe for BOTH server and client.
// No fs / node imports. The client-side /leaders page imports REGIONS from
// here; server routes import allLeaders() from ./leaders.js.

// Canonical URL slug: lowercase, spaces -> hyphens, drop non-alphanumeric.
export function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Standard geographic groupings for the region filter.
// Turkey placed in "Middle East & North Africa" (its foreign-policy
// orientation for atlas purposes). Ukraine/Belarus placed in Europe.
export const REGIONS = {
  "North America": ["United States", "Canada", "Mexico"],
  "Central America & Caribbean": ["El Salvador", "Cuba"],
  "South America": [
    "Brazil", "Argentina", "Colombia", "Chile", "Peru",
    "Ecuador", "Bolivia", "Venezuela",
  ],
  "Europe": [
    "Germany", "France", "United Kingdom", "Italy", "Spain",
    "Poland", "Netherlands", "Switzerland", "Sweden", "Norway",
    "Finland", "Greece", "Ukraine", "Belarus",
  ],
  "Middle East & North Africa": [
    "Israel", "Saudi Arabia", "United Arab Emirates", "Iran",
    "Qatar", "Egypt", "Iraq", "Jordan", "Kuwait", "Syria",
    "Lebanon", "Libya", "Yemen", "Morocco", "Algeria", "Tunisia",
    "Turkey",
  ],
  "Central Asia & Caucasus": [
    "Kazakhstan", "Uzbekistan", "Afghanistan", "Azerbaijan",
  ],
  "South Asia": ["India", "Pakistan"],
  "East Asia": ["China", "Japan", "South Korea", "North Korea"],
  "Southeast Asia": ["Indonesia"],
  "Oceania": ["Australia"],
  "Eurasia (Russia)": ["Russia"],
};

// Reverse index: country name -> region.
export const NAME_TO_REGION = (() => {
  const idx = {};
  for (const [region, names] of Object.entries(REGIONS)) {
    for (const n of names) idx[n] = region;
  }
  return idx;
})();

// Flag emoji per country (Regional Indicator Symbols).
export const FLAGS = {
  "United States": "🇺🇸",
  "China": "🇨🇳",
  "Russia": "🇷🇺",
  "India": "🇮🇳",
  "Germany": "🇩🇪",
  "Japan": "🇯🇵",
  "France": "🇫🇷",
  "Israel": "🇮🇱",
  "United Kingdom": "🇬🇧",
  "Brazil": "🇧🇷",
  "Turkey": "🇹🇷",
  "South Korea": "🇰🇷",
  "Saudi Arabia": "🇸🇦",
  "Canada": "🇨🇦",
  "Indonesia": "🇮🇩",
  "United Arab Emirates": "🇦🇪",
  "Italy": "🇮🇹",
  "Spain": "🇪🇸",
  "Australia": "🇦🇺",
  "Poland": "🇵🇱",
  "Netherlands": "🇳🇱",
  "Mexico": "🇲🇽",
  "Pakistan": "🇵🇰",
  "Switzerland": "🇨🇭",
  "Egypt": "🇪🇬",
  "Qatar": "🇶🇦",
  "Iran": "🇮🇷",
  "Sweden": "🇸🇪",
  "Argentina": "🇦🇷",
  "Norway": "🇳🇴",
  "Ukraine": "🇺🇦",
  "Finland": "🇫🇮",
  "Greece": "🇬🇷",
  "Morocco": "🇲🇦",
  "Colombia": "🇨🇴",
  "Kazakhstan": "🇰🇿",
  "Algeria": "🇩🇿",
  "Iraq": "🇮🇶",
  "Chile": "🇨🇱",
  "Kuwait": "🇰🇼",
  "North Korea": "🇰🇵",
  "Azerbaijan": "🇦🇿",
  "Uzbekistan": "🇺🇿",
  "Jordan": "🇯🇴",
  "Peru": "🇵🇪",
  "Belarus": "🇧🇾",
  "El Salvador": "🇸🇻",
  "Ecuador": "🇪🇨",
  "Syria": "🇸🇾",
  "Bolivia": "🇧🇴",
  "Venezuela": "🇻🇪",
  "Tunisia": "🇹🇳",
  "Cuba": "🇨🇺",
  "Lebanon": "🇱🇧",
  "Libya": "🇱🇾",
  "Afghanistan": "🇦🇫",
  "Yemen": "🇾🇪",
};

// Nuclear category: "yes" (declared or undeclared holder), "host" (hosts
// another country's weapons), "no" (neither).
export function nuclearCategory(nuclearText) {
  const t = String(nuclearText || "").toLowerCase();
  if (t.startsWith("nuclear")) return "yes";
  if (t.includes("host")) return "host";
  return "no";
}
