// Canonical list of the narratable sections on the Foreign Policy seminar
// reader, in page (scroll) order. This module is PURE and client-safe — it has
// no node/server imports — so both the reader (to build the per-section audio
// controls and the whole-page playlist) and the server (to know which section
// keys are valid) import the same source of truth.
//
//   key    — stable identifier used in the /api/seminar/section-audio URL and
//            as the cache key column value.
//   label  — human copy for the "Listen to this section" control + the
//            whole-page player's now-playing readout.
//   domId  — the <section id> in SeminarView, used to highlight and scroll the
//            section that is currently narrating.
//
// Interactive sections (Debate Room, Study Saves, Carry-Forward) are
// deliberately excluded — they are live tools, not prose to read aloud.

export const SECTION_ORDER = [
  { key: "briefing",       label: "Weekly Briefing", domId: "briefing" },
  { key: "deep_dive",      label: "Deep Dive",       domId: "deep-dive" },
  { key: "gaps",           label: "Gaps to Fill",    domId: "gaps" },
  { key: "implications",   label: "Implications",    domId: "implications" },
  { key: "what_to_watch",  label: "What to Watch",   domId: "what-to-watch" },
  { key: "pattern_echoes", label: "Pattern Echoes",  domId: "pattern-echoes" },
];

export const SECTION_KEYS = SECTION_ORDER.map((s) => s.key);
export const SECTION_BY_KEY = Object.fromEntries(SECTION_ORDER.map((s) => [s.key, s]));

function anyValue(obj) {
  if (!obj || typeof obj !== "object") return false;
  return Object.values(obj).some((v) => String(v || "").trim().length > 0);
}

// Given the payload from /api/seminar/current (or the equivalent DB bundle on
// the server: { edition, events, deep_dive, pattern_echoes }), return the
// subset of SECTION_ORDER that actually has readable content this week. The
// membership rules mirror the render guards in SeminarView so a section only
// gets a Listen control when the section itself is on the page.
export function presentSections(data) {
  const events = (data && data.events) || [];
  const dd = (data && data.deep_dive) || null;
  const echoes = (data && (data.pattern_echoes || data.echoes)) || [];

  const layers = (dd && dd.layers) || {};
  const lenses = (dd && dd.lenses) || {};

  const has = {
    briefing: events.length > 0,
    // Layers always render when a deep dive exists, but only count if at least
    // one layer or lens actually carries prose.
    deep_dive: !!dd && (anyValue(layers) || anyValue(lenses)),
    gaps: !!dd && anyValue(dd.gaps),
    implications: !!dd && anyValue(dd.implications),
    what_to_watch: !!(dd && String(dd.what_to_watch || "").trim()),
    pattern_echoes: Array.isArray(echoes) && echoes.length > 0,
  };

  return SECTION_ORDER.filter((s) => has[s.key]);
}
