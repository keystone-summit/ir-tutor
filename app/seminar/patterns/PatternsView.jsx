"use client";
// The Library of Patterns reader. Loads the full historical-pattern library
// (with per-pattern cross-reference of matched editions), lets the user filter
// by era / region / pattern_type / free-text, and opens a full detail modal on
// click. Each card also carries a quick "Save to module" button (Option 3).
//
// Mobile-first: cards collapse to a single column; the filter bar wraps.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowLeft, Loader2, Library, Search, X, Network, BookmarkPlus, Check,
  Link2, Filter,
} from "lucide-react";
import { authFetch } from "../../../lib/clientAuth";
import PatternModal, { patternTypeLabel } from "../../../components/PatternModal";

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function PatternsView() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [patterns, setPatterns] = useState([]);
  const [era, setEra] = useState("");
  const [region, setRegion] = useState("");
  const [ptype, setPtype] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);     // pattern open in modal
  const [savedIds, setSavedIds] = useState({});   // per-card save state

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await authFetch("/api/seminar/patterns");
        const j = await r.json();
        if (!on) return;
        if (!j.ok) setErr(j.error || "Failed to load the library.");
        else setPatterns(Array.isArray(j.patterns) ? j.patterns : []);
      } catch { if (on) setErr("Network error."); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, []);

  const eras = useMemo(() => uniqSorted(patterns.map((p) => p.era)), [patterns]);
  const regions = useMemo(() => uniqSorted(patterns.map((p) => p.region)), [patterns]);
  const ptypes = useMemo(() => uniqSorted(patterns.map((p) => p.pattern_type)), [patterns]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return patterns.filter((p) => {
      if (era && p.era !== era) return false;
      if (region && p.region !== region) return false;
      if (ptype && p.pattern_type !== ptype) return false;
      if (needle) {
        const hay = [
          p.name, p.description, p.what_happened, p.lessons, p.outcome,
          (p.parties || []).join(" "), (p.modern_relevance_keywords || []).join(" "),
        ].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [patterns, era, region, ptype, q]);

  const matchedCount = (p) => (Array.isArray(p.matched_editions) ? p.matched_editions.length : 0);

  const onSaved = useCallback(() => {}, []);

  async function quickSave(p) {
    setSavedIds((s) => ({ ...s, [p.id]: "saving" }));
    const summary =
      `${p.name} — historical pattern (${patternTypeLabel(p.pattern_type)})\n` +
      `${p.era || ""}${p.date_range ? " · " + p.date_range : ""}${p.region ? " · " + p.region : ""}\n\n` +
      `${p.description || ""}\n\n` +
      (p.what_happened ? `What happened:\n${p.what_happened}\n\n` : "") +
      (p.outcome ? `Outcome:\n${p.outcome}\n\n` : "") +
      (p.lessons ? `Lessons:\n${p.lessons}` : "");
    try {
      const r = await authFetch("/api/chat-saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course: "fp_seminar",
          week_number: 0,
          summary: summary.slice(0, 8000),
          transcript_json: { type: "historical_pattern", pattern_id: p.id, pattern: p },
          title: `${p.name} — historical pattern`,
        }),
      });
      const j = await r.json();
      setSavedIds((s) => ({ ...s, [p.id]: j && j.ok ? "saved" : "error" }));
    } catch { setSavedIds((s) => ({ ...s, [p.id]: "error" })); }
  }

  const anyFilter = era || region || ptype || q;

  return (
    <div className="sem-wrap pl-wrap">
      {active && <PatternModal pattern={active} wk={0} onClose={() => setActive(null)} onSaved={onSaved} />}

      <div className="sem-topbar">
        <a href="/seminar" className="sem-back"><ArrowLeft size={15} /> This week</a>
        <a href="/seminar/graph" className="sem-archlink"><Network size={13} /> Actor Graph</a>
        <a href="/seminar/archive" className="sem-archlink">Archive</a>
      </div>

      <header className="sem-head">
        <div className="sem-kicker"><Library size={15} /> Library of Patterns</div>
        <h1>Historical Pattern Library</h1>
        <div className="sem-daterange">
          Inflection points across a century of foreign policy. Each week's events are matched
          against these — open any pattern to see how today rhymes with it.
        </div>
      </header>

      {loading ? (
        <div className="sem-boot"><Loader2 className="sem-spin" /> Loading the library…</div>
      ) : err ? (
        <div className="sem-empty"><p>{err}</p></div>
      ) : (
        <>
          {/* Filter bar */}
          <div className="pl-filters">
            <div className="pl-search">
              <Search size={14} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search patterns, parties, keywords…"
                aria-label="Search patterns"
              />
              {q && <button className="pl-search-x" onClick={() => setQ("")} aria-label="Clear search"><X size={14} /></button>}
            </div>
            <div className="pl-selects">
              <select value={era} onChange={(e) => setEra(e.target.value)} aria-label="Filter by era">
                <option value="">All eras</option>
                {eras.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filter by region">
                <option value="">All regions</option>
                {regions.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={ptype} onChange={(e) => setPtype(e.target.value)} aria-label="Filter by pattern type">
                <option value="">All types</option>
                {ptypes.map((x) => <option key={x} value={x}>{patternTypeLabel(x)}</option>)}
              </select>
              {anyFilter && (
                <button className="pl-clear" onClick={() => { setEra(""); setRegion(""); setPtype(""); setQ(""); }}>
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="pl-count">
            <Filter size={12} /> {filtered.length} of {patterns.length} pattern{patterns.length === 1 ? "" : "s"}
          </div>

          {filtered.length === 0 ? (
            <div className="sem-empty"><p>No patterns match these filters.</p></div>
          ) : (
            <div className="pl-grid">
              {filtered.map((p) => {
                const n = matchedCount(p);
                const st = savedIds[p.id];
                return (
                  <article key={p.id} className="pl-card">
                    <button className="pl-card-main" onClick={() => setActive(p)} aria-label={`Open ${p.name}`}>
                      <span className="pl-type">{patternTypeLabel(p.pattern_type)}</span>
                      <h3 className="pl-name">{p.name}</h3>
                      <div className="pl-meta">
                        {p.era && <span>{p.era}</span>}
                        {p.region && <span>· {p.region}</span>}
                        {p.date_range && <span>· {p.date_range}</span>}
                      </div>
                      <p className="pl-desc">{p.description}</p>
                    </button>
                    <div className="pl-card-foot">
                      {n > 0 ? (
                        <span className="pl-matched"><Link2 size={12} /> Matched in {n} event{n === 1 ? "" : "s"}</span>
                      ) : (
                        <span className="pl-matched none">Not yet matched</span>
                      )}
                      <button
                        className="sem-savebtn pl-save"
                        disabled={st === "saving" || st === "saved"}
                        onClick={() => quickSave(p)}
                        title="Save this pattern to my module"
                      >
                        {st === "saved" ? <><Check size={12} /> Saved</>
                          : st === "saving" ? <><Loader2 size={12} className="sem-spin" /> …</>
                          : st === "error" ? <>Retry</>
                          : <><BookmarkPlus size={12} /> Save</>}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PatternsView;
