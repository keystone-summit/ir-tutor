// lib/leaders.js — Server-side helpers for the /leaders feature.
// Loads leaders_57.json from disk (edge-safe: import via fs at request-time),
// exposes filters, and provides a canonical slug + region mapping per country.

import fs from "node:fs";
import path from "node:path";

let CACHED = null;

function loadRaw() {
  if (CACHED) return CACHED;
  const p = path.join(process.cwd(), "data", "leaders_57.json");
  const raw = fs.readFileSync(p, "utf8");
  CACHED = JSON.parse(raw);
  return CACHED;
}

// Canonical URL slug: lowercase, spaces -> hyphens, drop non-alphanumeric.
export function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Standard geographic groupings for the region filter.
// Turkey placed in "Middle East & North Africa" (its foreign-policy orientation
// for atlas purposes). Ukraine/Belarus placed in Europe.
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
const NAME_TO_REGION = (() => {
  const idx = {};
  for (const [region, names] of Object.entries(REGIONS)) {
    for (const n of names) idx[n] = region;
  }
  return idx;
})();

// Flag emoji per country (Regional Indicator Symbols) — used in the UI grid
// as a lightweight visual anchor; falls back to a globe if unknown.
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
// someone else's weapons on their soil), "no" (neither). Both the nuclear
// filter query and the country brief use this.
export function nuclearCategory(nuclearText) {
  const t = String(nuclearText || "").toLowerCase();
  if (t.startsWith("nuclear")) return "yes";
  // "hosts US weapons", "hosts Russian tactical weapons since 2023"
  if (t.includes("host")) return "host";
  return "no";
}

// Enrich raw records with derived fields the UI needs everywhere.
export function enrich(row) {
  const region = NAME_TO_REGION[row.name] || "Other";
  return {
    ...row,
    slug: slugify(row.name),
    region,
    flag: FLAGS[row.name] || "",
    nuclear_category: nuclearCategory(row.nuclear),
  };
}

export function allLeaders() {
  return loadRaw().map(enrich);
}

export function findBySlug(slug) {
  if (!slug) return null;
  const target = String(slug).toLowerCase();
  return allLeaders().find((r) => r.slug === target) || null;
}

// Apply the API query filters uniformly (used by /api/leaders/list).
export function applyFilters(rows, params = {}) {
  let out = rows.slice();
  const { nuclear, minPower, search } = params;

  if (nuclear) {
    const want = String(nuclear).toLowerCase();
    if (want === "yes" || want === "declared" || want === "undeclared") {
      out = out.filter((r) => r.nuclear_category === "yes");
    } else if (want === "host") {
      out = out.filter((r) => r.nuclear_category === "host");
    } else if (want === "no") {
      out = out.filter((r) => r.nuclear_category === "no");
    }
  }

  if (minPower != null && minPower !== "") {
    const n = Number(minPower);
    if (Number.isFinite(n)) out = out.filter((r) => (r.power ?? 0) >= n);
  }

  if (search) {
    const q = String(search).toLowerCase().trim();
    if (q) {
      out = out.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.leader && r.leader.toLowerCase().includes(q))
      );
    }
  }

  return out;
}
