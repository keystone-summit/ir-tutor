"use client";
// The IR Theory Library reader (Phase 3.5). Loads all ~73 theory entries, lets
// the user filter by school (8 color-coded chips), era, and free-text search,
// and opens a school-colored drawer on click. Mirrors the Library-of-Patterns
// page's structure + classes for visual consistency.
//
// Mobile-first: cards collapse to a single column; the chip row wraps.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowLeft, Loader2, BookMarked, Search, X, Network, Library, Filter,
} from "lucide-react";
import { authFetch } from "../../../lib/clientAuth";
import TheoryDrawer from "../../../components/TheoryDrawer";
import { SCHOOLS, schoolClass, schoolColor } from "../../../lib/seminarTheorySchools";

const ERA_ORDER = ["Classical", "Mid-century", "Modern", "Contemporary"];

function TheoriesView() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [theories, setTheories] = useState([]);
  const [school, setSchool] = useState("");   // SCHOOLS[].name
  const [era, setEra] = useState("");
  const [q, setQ] = useState("");
  const [activeSlug, setActiveSlug] = useState(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await authFetch("/api/seminar/theories");
        const j = await r.json();
        if (!on) return;
        if (!j.ok) setErr(j.error || "Failed to load the library.");
        else setTheories(Array.isArray(j.theories) ? j.theories : []);
      } catch { if (on) setErr("Network error."); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, []);

  const bySlug = useMemo(() => {
    const m = new Map();
    theories.forEach((t) => m.set(t.slug, t));
    return m;
  }, [theories]);

  const eras = useMemo(() => {
    const present = new Set(theories.map((t) => t.era).filter(Boolean));
    return ERA_ORDER.filter((e) => present.has(e));
  }, [theories]);

  // Count per school so chips can show how many entries each holds.
  const schoolCounts = useMemo(() => {
    const c = {};
    theories.forEach((t) => { c[t.school] = (c[t.school] || 0) + 1; });
    return c;
  }, [theories]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return theories.filter((t) => {
      if (school && t.school !== school) return false;
      if (era && t.era !== era) return false;
      if (needle) {
        const hay = [
          t.name, t.school, t.sub_school, t.classic_thinker, t.definition,
          t.canonical_example, t.modern_echo,
          (t.match_terms || []).join(" "),
        ].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [theories, school, era, q]);

  const onNavigate = useCallback((slug) => {
    if (bySlug.has(slug)) setActiveSlug(slug);
  }, [bySlug]);

  const anyFilter = school || era || q;
  const active = activeSlug ? bySlug.get(activeSlug) : null;

  return (
    <div className="sem-wrap pl-wrap">
      {active && (
        <TheoryDrawer
          theory={active}
          onClose={() => setActiveSlug(null)}
          onNavigate={onNavigate}
          onSaved={() => {}}
        />
      )}

      <div className="sem-topbar">
        <a href="/seminar" className="sem-back"><ArrowLeft size={15} /> This week</a>
        <a href="/seminar/graph" className="sem-archlink"><Network size={13} /> Actor Graph</a>
        <a href="/seminar/patterns" className="sem-archlink"><Library size={13} /> Patterns</a>
      </div>

      <header className="sem-head">
        <div className="sem-kicker"><BookMarked size={15} /> Theory Library</div>
        <h1>IR Theory Library</h1>
        <div className="sem-daterange">
          The schools and concepts behind the analysis — from Thucydides to weaponized
          interdependence. Filter by school or era, or open any entry for its definition,
          canonical case, and modern echo.
        </div>
      </header>

      {loading ? (
        <div className="sem-boot"><Loader2 className="sem-spin" /> Loading the library…</div>
      ) : err ? (
        <div className="sem-empty"><p>{err}</p></div>
      ) : (
        <>
          {/* School color chips */}
          <div className="tl-chips" role="group" aria-label="Filter by school">
            <button
              className={`tl-chip ${school === "" ? "active" : ""}`}
              onClick={() => setSchool("")}
            >
              All schools <span className="tl-chip-n">{theories.length}</span>
            </button>
            {SCHOOLS.map((s) => (
              <button
                key={s.key}
                className={`tl-chip school-${s.key} ${school === s.name ? "active" : ""}`}
                style={{ "--thd-accent": s.color }}
                onClick={() => setSchool(school === s.name ? "" : s.name)}
                disabled={!schoolCounts[s.name]}
                title={s.name}
              >
                <span className="tl-chip-dot" style={{ background: s.color }} />
                {s.short} <span className="tl-chip-n">{schoolCounts[s.name] || 0}</span>
              </button>
            ))}
          </div>

          {/* Search + era */}
          <div className="pl-filters">
            <div className="pl-search">
              <Search size={14} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search theories, thinkers, terms…"
                aria-label="Search theories"
              />
              {q && <button className="pl-search-x" onClick={() => setQ("")} aria-label="Clear search"><X size={14} /></button>}
            </div>
            <div className="pl-selects">
              <select value={era} onChange={(e) => setEra(e.target.value)} aria-label="Filter by era">
                <option value="">All eras</option>
                {eras.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              {anyFilter && (
                <button className="pl-clear" onClick={() => { setSchool(""); setEra(""); setQ(""); }}>
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="pl-count">
            <Filter size={12} /> {filtered.length} of {theories.length} theor{theories.length === 1 ? "y" : "ies"}
          </div>

          {filtered.length === 0 ? (
            <div className="sem-empty"><p>No theories match these filters.</p></div>
          ) : (
            <div className="pl-grid">
              {filtered.map((t) => (
                <article key={t.slug} className={`pl-card tl-card ${schoolClass(t.school)}`} style={{ "--thd-accent": schoolColor(t.school) }}>
                  <button className="pl-card-main" onClick={() => setActiveSlug(t.slug)} aria-label={`Open ${t.name}`}>
                    <span className="tl-school"><span className="tl-chip-dot" style={{ background: schoolColor(t.school) }} />{t.school}</span>
                    <h3 className="pl-name">{t.name}</h3>
                    <div className="pl-meta">
                      {t.sub_school && <span>{t.sub_school}</span>}
                      {t.era && <span>· {t.era}</span>}
                    </div>
                    <p className="pl-desc">{t.definition}</p>
                    {t.classic_thinker && <div className="tl-thinker">{t.classic_thinker}</div>}
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default TheoriesView;
