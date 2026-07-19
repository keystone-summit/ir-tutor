// lib/leaders.js — SERVER-ONLY helpers. Reads data/leaders_57.json from
// disk via node:fs, so importing this from a "use client" file will break
// the client bundle. Pure-data helpers (REGIONS, FLAGS, slugify,
// nuclearCategory) live in lib/leadersMeta.js and are safe to import from
// either side.
import fs from "node:fs";
import path from "node:path";
import {
  slugify,
  FLAGS,
  NAME_TO_REGION,
  nuclearCategory,
  REGIONS,
} from "./leadersMeta.js";

export { slugify, FLAGS, REGIONS, NAME_TO_REGION, nuclearCategory };

let CACHED = null;

function loadRaw() {
  if (CACHED) return CACHED;
  const p = path.join(process.cwd(), "data", "leaders_57.json");
  const raw = fs.readFileSync(p, "utf8");
  CACHED = JSON.parse(raw);
  return CACHED;
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
