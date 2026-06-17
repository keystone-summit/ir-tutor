// Phase 3.5 — the 8 color-coded IR theory schools. The `school` string stored
// on each seminar_theory_library row is one of SCHOOL_KEYS exactly; this maps
// it to a stable CSS class (`school-<id>`) + accent color for the drawer header
// and the standalone library's filter chips.
//
// Color spec (from the Phase 3.5 dispatch):
//   Realism                — slate   #475569
//   Liberalism             — blue    #2563EB
//   Constructivism         — amber   #D97706
//   English School         — green   #16A34A
//   Marxist / Critical     — red     #DC2626
//   Strategic Studies      — purple  #9333EA
//   Decision-Making        — teal    #0D9488
//   Modern / Geoeconomic   — orange  #EA580C

export const SCHOOLS = [
  { key: "realism",        name: "Realism",              color: "#475569", short: "Realism" },
  { key: "liberalism",     name: "Liberalism",           color: "#2563EB", short: "Liberalism" },
  { key: "constructivism", name: "Constructivism",       color: "#D97706", short: "Constructivism" },
  { key: "english",        name: "English School",       color: "#16A34A", short: "English School" },
  { key: "marxist",        name: "Marxist / Critical",   color: "#DC2626", short: "Marxist" },
  { key: "strategic",      name: "Strategic Studies",    color: "#9333EA", short: "Strategic" },
  { key: "decision",       name: "Decision-Making",      color: "#0D9488", short: "Decision" },
  { key: "modern",         name: "Modern / Geoeconomic", color: "#EA580C", short: "Modern" },
];

// Map a stored `school` string -> its SCHOOLS entry.
export function schoolMeta(school) {
  const s = String(school || "").trim();
  return SCHOOLS.find((x) => x.name.toLowerCase() === s.toLowerCase()) || null;
}

// CSS class for the school accent (paired with the `.school-*` rules in globals.css).
export function schoolClass(school) {
  const m = schoolMeta(school);
  return m ? `school-${m.key}` : "school-other";
}

export function schoolColor(school) {
  const m = schoolMeta(school);
  return m ? m.color : "#6f6757";
}
