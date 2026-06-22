"use client";
// The weekly FP seminar reader. Fetches the current published edition and
// renders, in order: Weekly Briefing -> Deep Dive (layers + lenses) -> Gaps
// to Fill -> Implications -> What to Watch -> Debate Room -> Study Saves.
//
// Phase 2 wires the two formerly-stubbed features:
//  - Party click-in cards: any named actor in the prose opens a 5-panel
//    drawer (trajectory / current-position-decoded / action upside / inaction
//    upside / faction sub-map), generated on first click and cached 7 days.
//  - Debate Room: four IR-theory personas give opening reads, and the reader
//    can pick one and debate it live.
// All of these integrate with Option 3's save flow — cards, openings, and
// debates save into chat_saves (course='fp_seminar') and surface in the
// Study Saves panel at the foot of the page.
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Globe, ArrowLeft, BookmarkPlus, Check, ExternalLink, Eye, Scale,
  Layers as LayersIcon, Search, Building2, Users, MessageSquare, Loader2,
  X, Clock, TrendingUp, ThumbsUp, Pause, Network, Send, ChevronRight, Swords,
  History, Library, BookMarked, AlertTriangle,
} from "lucide-react";
import { authFetch } from "../../lib/clientAuth";
import StudySaves from "../../components/StudySaves";
import PatternModal, { patternTypeLabel } from "../../components/PatternModal";
import TheoryDrawer from "../../components/TheoryDrawer";
import SeminarAudio from "../../components/SeminarAudio";
import { briefingAudioUrl } from "../../lib/seminarAudio";

// Quota buckets surfaced in the Weekly Briefing region-coverage strip.
const REGION_BUCKETS = [
  ["middle_east", "Middle East"],
  ["asia", "Asia"],
  ["americas", "Americas"],
  ["europe_russia", "Europe / Russia"],
  ["brics_trade", "BRICS-trade"],
];
const REGION_BUCKET_LABEL = Object.fromEntries(REGION_BUCKETS);

const LAYER_DEFS = [
  ["world_order", "Layer 1 · World Order", "How this reshapes the global system & great-power balance."],
  ["regional", "Layer 2 · Regional", "Effects on the immediate region and its balance of power."],
  ["bilateral", "Layer 3 · Bilateral", "The key state-to-state relationships in play."],
  ["domestic", "Layer 4 · Domestic", "Internal politics driving each actor's behaviour."],
  ["actor", "Layer 5 · Actor", "The individuals, factions and organisations at the table."],
];

const LENS_DEFS = [
  ["realism", "Realism", "Power, security, the balance of capabilities."],
  ["liberalism", "Liberalism", "Institutions, interdependence, cooperation."],
  ["constructivism", "Constructivism", "Identity, norms, narrative, legitimacy."],
  ["marxist", "Marxist / World-Systems", "Class, capital, core–periphery structure."],
  ["game_theory", "Game Theory", "Incentives, signalling, equilibria."],
];

const GAP_DEFS = [
  ["info", "Information gaps", "What facts we still don't have."],
  ["source_bias", "Source-bias gaps", "How each source's worldview colours the picture."],
  ["counterfactual", "Counterfactuals", "What if a key actor chose differently."],
  ["osint", "OSINT gaps", "Open-source signals worth tracking."],
  ["counter_intel", "Counter-intel red flags", "Where we might be deliberately misled."],
];

const IMP_DEFS = [
  ["us_strategy", "US Strategy"],
  ["us_business", "US Business"],
  ["us_households", "US Households"],
];

// The seminar's DATE columns come back from Postgres as JS Date objects, which
// JSON-serialise to a full ISO timestamp like "2026-06-15T04:00:00.000Z" (the
// pg driver anchors the date at the server's local midnight). Slice that back to
// a clean YYYY-MM-DD day key before parsing — otherwise `new Date(v + "T00:00:00Z")`
// builds garbage ("2026-06-15T04:00:00.000ZT00:00:00Z") and renders "Invalid Date".
function ymd(v) {
  if (!v) return "";
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

function weekKeyOf(weekStart) {
  const d = ymd(weekStart);
  if (!d) return 0;
  const t = Date.parse(d + "T00:00:00Z");
  return Number.isFinite(t) ? Math.floor(t / (7 * 86400000)) : 0;
}

// Plain-language week label, e.g. "Week of June 15, 2026". Parsed in UTC so the
// day never drifts across a timezone boundary.
function fmtWeekOf(weekStart) {
  const d = ymd(weekStart);
  if (!d) return "";
  const dt = new Date(d + "T00:00:00Z");
  if (Number.isNaN(dt.getTime())) return `Week of ${weekStart}`;
  return "Week of " + dt.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtRange(a, b) {
  const da = ymd(a), db = ymd(b);
  if (!da || !db) return [da, db].filter(Boolean).join(" – ");
  const opt = { month: "short", day: "numeric", timeZone: "UTC" };
  const s = new Date(da + "T00:00:00Z").toLocaleDateString("en-US", opt);
  const e = new Date(db + "T00:00:00Z").toLocaleDateString("en-US", { ...opt, year: "numeric" });
  return `${s} – ${e}`;
}

// POST a save into chat_saves under the fp_seminar course (Option 3 flow).
// Exported so the Phase 3a Actor Graph can reuse the same save surface.
export async function postModuleSave({ wk, summary, transcript, title }) {
  const r = await authFetch("/api/chat-saves", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      course: "fp_seminar",
      week_number: wk,
      summary: String(summary || "").slice(0, 8000),
      transcript_json: transcript || {},
      title: title || null,
    }),
  });
  return r.json().catch(() => ({ ok: false }));
}

// Render prose, wrapping (a) any named party in a click-in dossier button and
// (b) any known IR-theory term in a theory-tag button (opens the theory drawer).
// Both sets are matched in one pass; longer strings win, and theory terms are
// tagged only on their first occurrence per block to avoid clutter. Theory
// matching is word-bounded + case-insensitive; party names keep priority.
function AnnotatedText({ text, parties, theoryTerms, onParty, onTheory }) {
  const nodes = useMemo(() => {
    const s = String(text || "");
    if (!s) return [s];
    const tokens = [];
    (parties || []).forEach((p) => {
      if (p && p.name) tokens.push({ str: String(p.name), kind: "party", payload: String(p.name) });
    });
    (theoryTerms || []).forEach((t) => {
      if (t && t.term) tokens.push({ str: String(t.term), kind: "theory", payload: t.slug });
    });
    if (!tokens.length) return [s];
    // Longer strings first so e.g. "balance of threat" beats "balance".
    tokens.sort((a, b) => b.str.length - a.str.length);
    const esc = tokens.map((t) => t.str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Word-bounded so "swift" doesn't match inside "swiftly".
    const re = new RegExp(`\\b(${esc.join("|")})\\b`, "gi");
    const lut = new Map(); // lowercased str -> token (first/longest wins)
    tokens.forEach((t) => { const k = t.str.toLowerCase(); if (!lut.has(k)) lut.set(k, t); });
    const usedTheory = new Set();
    const parts = s.split(re);
    return parts.map((part, i) => {
      const tok = lut.get(String(part).toLowerCase());
      if (tok && tok.kind === "party") {
        return (
          <button key={i} type="button" className="party-link"
            title={`${part} — open dossier`} onClick={() => onParty(tok.payload)}>
            {part}
          </button>
        );
      }
      if (tok && tok.kind === "theory" && onTheory) {
        if (usedTheory.has(tok.payload)) return <React.Fragment key={i}>{part}</React.Fragment>;
        usedTheory.add(tok.payload);
        return (
          <button key={i} type="button" className="theory-tag" data-theory-id={tok.payload}
            title={`${part} — open theory`} onClick={() => onTheory(tok.payload)}>
            {part}
          </button>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  }, [text, parties, theoryTerms, onParty, onTheory]);
  return <>{nodes}</>;
}

// Phase 3.5 — the 5-region quota coverage strip under the Weekly Briefing.
// Reads the edition's stored region_coverage / underweighted_regions if present,
// otherwise derives coverage live from the events' region_bucket tags. Shows one
// pill per bucket (filled vs. underweighted) so the reader can see the week's
// global balance at a glance.
function RegionCoverage({ edition, events }) {
  const coverage = useMemo(() => {
    const stored = edition && edition.region_coverage;
    if (stored && typeof stored === "object") return stored;
    const c = {};
    (events || []).forEach((e) => {
      if (e && e.region_bucket) c[e.region_bucket] = (c[e.region_bucket] || 0) + 1;
    });
    return c;
  }, [edition, events]);

  const under = (edition && Array.isArray(edition.underweighted_regions))
    ? new Set(edition.underweighted_regions)
    : new Set(REGION_BUCKETS.filter(([k]) => !coverage[k]).map(([k]) => k));

  // Nothing to show until events carry buckets (pre-Phase-3.5 editions).
  const anyTagged = REGION_BUCKETS.some(([k]) => coverage[k]);
  if (!anyTagged) return null;

  const filled = REGION_BUCKETS.filter(([k]) => coverage[k]).length;

  return (
    <div className="sem-regcov">
      <div className="sem-regcov-head">
        <Globe size={13} /> Regional balance
        <span className="sem-regcov-score">{filled}/5 regions</span>
      </div>
      <div className="sem-regcov-pills">
        {REGION_BUCKETS.map(([k, label]) => {
          const n = coverage[k] || 0;
          const isUnder = under.has(k) || n === 0;
          return (
            <span key={k} className={`sem-regcov-pill rb-${k} ${isUnder ? "under" : "filled"}`}>
              <span className="sem-regcov-dot" />
              {label}{n > 0 ? ` · ${n}` : ""}
            </span>
          );
        })}
      </div>
      {[...under].length > 0 && (
        <div className="sem-regcov-warn">
          <AlertTriangle size={12} /> Underweighted this week: {[...under].map((k) => REGION_BUCKET_LABEL[k] || k).join(", ")} — limited qualifying coverage in the source feeds.
        </div>
      )}
    </div>
  );
}

export default function SeminarView() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [savedKeys, setSavedKeys] = useState({});       // per-block "Saved ✓" (notes)
  const [savedCount, setSavedCount] = useState(0);
  const [activeParty, setActiveParty] = useState("");
  const [activePattern, setActivePattern] = useState(null);  // Phase 3b pattern modal
  const [theories, setTheories] = useState([]);              // Phase 3.5 theory library
  const [activeTheory, setActiveTheory] = useState(null);    // slug of theory open in drawer
  const [studyRefresh, setStudyRefresh] = useState(0);  // bump to reload Study Saves

  const edition = data && data.edition;
  const events = (data && data.events) || [];
  const dd = data && data.deep_dive;
  const layers = (dd && dd.layers) || {};
  const lenses = (dd && dd.lenses) || {};
  const gaps = (dd && dd.gaps) || {};
  const implications = (dd && dd.implications) || {};
  const parties = (layers && layers._parties) || [];
  const echoes = (data && data.pattern_echoes) || [];
  const health = (data && data.health) || null;
  const wk = edition ? weekKeyOf(edition.week_start_date) : 0;
  const seminarId = edition ? edition.id : null;

  // Phase 3.5 — flatten the theory library into an inline-scan lexicon
  // (term -> slug, plus each theory's own name) and a slug index for the drawer.
  const theoryBySlug = useMemo(() => {
    const m = new Map();
    theories.forEach((t) => m.set(t.slug, t));
    return m;
  }, [theories]);
  const theoryTerms = useMemo(() => {
    const out = [];
    const seen = new Set();
    theories.forEach((t) => {
      const terms = [t.name, ...((t.match_terms) || [])];
      terms.forEach((term) => {
        const k = String(term || "").trim().toLowerCase();
        if (k.length < 4 || seen.has(k)) return;   // skip tiny/ambiguous terms
        seen.add(k);
        out.push({ term: String(term), slug: t.slug });
      });
    });
    return out;
  }, [theories]);
  const activeTheoryObj = activeTheory ? theoryBySlug.get(activeTheory) : null;

  const onModuleSaved = useCallback(() => {
    setStudyRefresh((x) => x + 1);
    setSavedCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await authFetch("/api/seminar/current");
        const j = await r.json();
        if (!on) return;
        if (!j.ok) setErr(j.error || "Failed to load.");
        else setData(j);
      } catch { if (on) setErr("Network error."); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, []);

  // Phase 3.5 — load the IR theory library once so prose can be tagged inline
  // and the drawer can render from already-loaded entries (no per-click fetch).
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await authFetch("/api/seminar/theories");
        const j = await r.json();
        if (on && j.ok && Array.isArray(j.theories)) setTheories(j.theories);
      } catch { /* inline tags simply won't render — non-fatal */ }
    })();
    return () => { on = false; };
  }, []);

  // Pull existing seminar saves count for this week (Option 3 feedback).
  useEffect(() => {
    if (!edition) return;
    (async () => {
      try {
        const r = await authFetch(`/api/notes?course=seminar&week_number=${wk}`);
        const j = await r.json();
        if (j.ok && Array.isArray(j.notes)) setSavedCount(j.notes.length);
      } catch {}
    })();
  }, [edition, wk]);

  async function saveNote(key, content) {
    if (!edition) return;
    setSavedKeys((s) => ({ ...s, [key]: "saving" }));
    try {
      const r = await authFetch("/api/notes/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "seminar", week_number: wk, content }),
      });
      const j = await r.json();
      if (j.ok) {
        setSavedKeys((s) => ({ ...s, [key]: "saved" }));
        setSavedCount((c) => c + 1);
      } else {
        setSavedKeys((s) => ({ ...s, [key]: "error" }));
      }
    } catch {
      setSavedKeys((s) => ({ ...s, [key]: "error" }));
    }
  }

  function SaveBtn({ k, content, label = "Save", className = "sem-savebtn" }) {
    const st = savedKeys[k];
    return (
      <button
        type="button"
        className={className}
        disabled={st === "saving" || st === "saved"}
        onClick={() => saveNote(k, content)}
        title="Save to my study notes"
      >
        {st === "saved" ? <><Check size={13} /> Saved</>
          : st === "saving" ? <><Loader2 size={13} className="sem-spin" /> Saving…</>
          : st === "error" ? <>Retry</>
          : <><BookmarkPlus size={13} /> {label}</>}
      </button>
    );
  }

  if (loading) {
    return <div className="sem-wrap"><div className="sem-boot"><Loader2 className="sem-spin" /> Loading this week's seminar…</div></div>;
  }

  if (!edition) {
    return (
      <div className="sem-wrap">
        <TopBar savedCount={0} />
        <div className="sem-empty">
          <Globe size={40} />
          <h2>This week's edition is being prepared</h2>
          <p>{err || "The seminar publishes Monday mornings. Check back shortly."}</p>
        </div>
      </div>
    );
  }

  const fullText =
    `# ${edition.title}\n(${fmtRange(edition.week_start_date, edition.week_end_date)})\n\n` +
    `## Weekly Briefing\n` +
    events.map((e) => `${e.rank}. ${e.title} — ${e.summary || ""} [${e.source_name || ""}]`).join("\n") +
    (dd ? `\n\n## Deep Dive\n` +
      LAYER_DEFS.map(([k, lbl]) => `### ${lbl}\n${layers[k] || ""}`).join("\n\n") : "");

  // Section pills — only sections that are actually rendered (in scroll order).
  const navItems = [
    { id: "briefing", label: "Briefing" },
    ...(dd ? [{ id: "deep-dive", label: "Deep Dive" }] : []),
    ...(dd ? [{ id: "gaps", label: "Gaps" }] : []),
    ...(dd ? [{ id: "implications", label: "Implications" }] : []),
    ...(dd && seminarId != null ? [{ id: "debate", label: "Debate" }] : []),
    ...(dd && dd.what_to_watch ? [{ id: "what-to-watch", label: "What to Watch" }] : []),
    ...(echoes.length ? [{ id: "pattern-echoes", label: "Pattern Echoes" }] : []),
    { id: "carry-forward", label: "Carry-Forward" },
  ];

  // Phase 3b — group this edition's pattern echoes by event (rank order).
  const echoGroups = [];
  {
    const byEvent = new Map();
    for (const e of echoes) {
      const key = e.event_id;
      if (!byEvent.has(key)) {
        byEvent.set(key, { event_id: e.event_id, event_rank: e.event_rank, event_title: e.event_title, matches: [] });
        echoGroups.push(byEvent.get(key));
      }
      byEvent.get(key).matches.push(e);
    }
    echoGroups.sort((a, b) => (a.event_rank || 99) - (b.event_rank || 99));
  }

  return (
    <div className="sem-wrap">
      <TopBar savedCount={savedCount} />

      {health && health.skip && (
        <div className="sem-staleban" role="alert">
          <AlertTriangle size={16} />
          <span>
            <strong>This briefing may be a week behind.</strong> The newest edition published{" "}
            {health.days_since_published != null ? `${health.days_since_published} days ago` : "more than a week ago"}
            {" "}— the weekly run looks like it was skipped. A daily auto-recovery check is in place; if this is
            still showing tomorrow, re-run the seminar pipeline.
          </span>
        </div>
      )}

      <SectionNav items={navItems} />

      {activeParty && (
        <ActorDrawer
          name={activeParty}
          seminarId={seminarId}
          wk={wk}
          onClose={() => setActiveParty("")}
          onSaved={onModuleSaved}
        />
      )}

      {activePattern && (
        <PatternModal
          pattern={activePattern}
          wk={wk}
          onClose={() => setActivePattern(null)}
          onSaved={onModuleSaved}
        />
      )}

      {activeTheoryObj && (
        <TheoryDrawer
          theory={activeTheoryObj}
          onClose={() => setActiveTheory(null)}
          onNavigate={(slug) => { if (theoryBySlug.has(slug)) setActiveTheory(slug); }}
          onSaved={onModuleSaved}
        />
      )}

      <header className="sem-head">
        <div className="sem-kicker"><Globe size={15} /> Foreign Policy · Implications Seminar</div>
        <h1>{edition.title}</h1>
        <div className="sem-daterange">{fmtWeekOf(edition.week_start_date)}</div>
        {data && data.has_briefing_audio && (
          <div className="sem-briefaudio">
            <SeminarAudio src={briefingAudioUrl(edition.id)} label="Listen to this briefing" />
          </div>
        )}
        <SaveBtn k="__edition" content={fullText} label="Save this seminar to my notes" className="sem-savehero" />
      </header>

      {parties.length > 0 && (
        <div className="sem-partyhint">
          <Users size={13} /> Underlined names open a 5-panel dossier — history, decoded position, upside/downside, and a faction sub-map.
        </div>
      )}
      {theoryTerms.length > 0 && (
        <div className="sem-partyhint sem-theoryhint">
          <BookMarked size={13} /> Highlighted <span className="theory-tag theory-tag-demo">theory terms</span> open the{" "}
          <a href="/seminar/theories" className="sem-cf-link">IR Theory Library</a> — definition, canonical case, and modern echo.
        </div>
      )}

      {/* 1 — Weekly Briefing */}
      <section id="briefing" className="sem-sec">
        <h2 className="sem-h2"><Eye size={18} /> Weekly Briefing — Top 5 Events</h2>

        {/* Phase 3.5 — 5-region quota coverage strip */}
        <RegionCoverage edition={edition} events={events} />

        <ol className="sem-events">
          {events.map((e) => (
            <li key={e.id || e.rank} className={`sem-event ${e.rank === 1 ? "is-lead" : ""}`}>
              <div className="sem-rank">{e.rank}</div>
              <div className="sem-event-body">
                <h3>{e.title}{e.rank === 1 && <span className="sem-leadtag">Deep Dive ↓</span>}</h3>
                {e.summary && <p className="sem-summary">{e.summary}</p>}
                {e.reasoning && <p className="sem-why"><strong>Why it matters:</strong> {e.reasoning}</p>}
                <div className="sem-srcline">
                  {e.region_bucket && REGION_BUCKET_LABEL[e.region_bucket] && (
                    <span className={`sem-regchip rb-${e.region_bucket}`}>{REGION_BUCKET_LABEL[e.region_bucket]}</span>
                  )}
                  {e.source_region && <span className="sem-chip">{e.source_region}</span>}
                  {e.source_name && <span className="sem-src">{e.source_name}</span>}
                  {e.source_url && (
                    <a className="sem-srclink" href={e.source_url} target="_blank" rel="noopener noreferrer">
                      source <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 2 — Deep Dive: layers + lenses */}
      {dd && (
        <section id="deep-dive" className="sem-sec">
          <h2 className="sem-h2"><LayersIcon size={18} /> Deep Dive — {events[0] ? events[0].title : ""}</h2>

          <h3 className="sem-h3">Five-Layer Drill-Down</h3>
          <div className="sem-layers">
            {LAYER_DEFS.map(([k, lbl, hint]) => (
              <div key={k} className="sem-layer">
                <div className="sem-layer-lbl">{lbl}</div>
                <div className="sem-layer-hint">{hint}</div>
                <p><AnnotatedText text={layers[k]} parties={parties} theoryTerms={theoryTerms} onParty={setActiveParty} onTheory={setActiveTheory} /></p>
              </div>
            ))}
          </div>

          <h3 className="sem-h3"><Scale size={15} /> Five-Lens Analysis</h3>
          <div className="sem-cards">
            {LENS_DEFS.map(([k, lbl, hint]) => (
              lenses[k] ? (
                <div key={k} className="sem-card">
                  <div className="sem-card-head">
                    <div><div className="sem-card-title">{lbl}</div><div className="sem-card-hint">{hint}</div></div>
                    <SaveBtn k={`lens_${k}`} label="Save lens"
                      content={`Lens — ${lbl}\n\n${lenses[k]}\n\n(From: ${edition.title})`} />
                  </div>
                  <p><AnnotatedText text={lenses[k]} parties={parties} theoryTerms={theoryTerms} onParty={setActiveParty} onTheory={setActiveTheory} /></p>
                </div>
              ) : null
            ))}
          </div>
        </section>
      )}

      {/* 3 — Gaps to Fill */}
      {dd && (
        <section id="gaps" className="sem-sec">
          <h2 className="sem-h2"><Search size={18} /> Gaps to Fill</h2>
          <div className="sem-cards">
            {GAP_DEFS.map(([k, lbl, hint]) => (
              gaps[k] ? (
                <div key={k} className="sem-card">
                  <div className="sem-card-head">
                    <div><div className="sem-card-title">{lbl}</div><div className="sem-card-hint">{hint}</div></div>
                    <SaveBtn k={`gap_${k}`} label="Save gap"
                      content={`Gap — ${lbl}\n\n${gaps[k]}\n\n(From: ${edition.title})`} />
                  </div>
                  <p><AnnotatedText text={gaps[k]} parties={parties} theoryTerms={theoryTerms} onParty={setActiveParty} onTheory={setActiveTheory} /></p>
                </div>
              ) : null
            ))}
          </div>
        </section>
      )}

      {/* 4 — Implications */}
      {dd && (
        <section id="implications" className="sem-sec">
          <h2 className="sem-h2"><Building2 size={18} /> Implications</h2>
          <div className="sem-imp">
            {IMP_DEFS.map(([k, lbl]) => (
              implications[k] ? (
                <div key={k} className="sem-imp-col">
                  <div className="sem-imp-lbl">{lbl}</div>
                  <p><AnnotatedText text={implications[k]} parties={parties} theoryTerms={theoryTerms} onParty={setActiveParty} onTheory={setActiveTheory} /></p>
                </div>
              ) : null
            ))}
          </div>
        </section>
      )}

      {/* 5 — Debate Room (live, Phase 2) */}
      {dd && seminarId != null && (
        <DebateRoom seminarId={seminarId} wk={wk} onSaved={onModuleSaved} />
      )}

      {/* 6 — What I'd Watch Next Week */}
      {dd && dd.what_to_watch && (
        <section id="what-to-watch" className="sem-sec">
          <h2 className="sem-h2"><Eye size={18} /> What I'd Watch Next Week</h2>
          <ul className="sem-watch">
            {String(dd.what_to_watch).split("\n").map((b, i) => {
              const t = b.replace(/^[-•]\s*/, "").trim();
              return t ? <li key={i}>{t}</li> : null;
            })}
          </ul>
        </section>
      )}

      {/* 6b — Pattern Echoes (Phase 3b) — between What to Watch and Carry-Forward */}
      {echoes.length > 0 && (
        <section id="pattern-echoes" className="sem-sec">
          <h2 className="sem-h2"><History size={18} /> Pattern Echoes</h2>
          <div className="pe-intro">
            How this week rhymes with the past. Each event is matched against the{" "}
            <a href="/seminar/patterns" className="sem-cf-link"><Library size={13} /> Library of Patterns</a>.
            Tap a pattern to open its full history.
          </div>
          <div className="pe-groups">
            {echoGroups.map((g) => (
              <div key={g.event_id} className="pe-group">
                <div className="pe-event">
                  {g.event_rank != null && <span className="pe-rank">{g.event_rank}</span>}
                  <span className="pe-event-title">{g.event_title}</span>
                </div>
                <div className="pe-echoes">
                  {g.matches.map((m, i) => (
                    <div key={i} className="pe-echo">
                      <button className="pe-echo-head" onClick={() => setActivePattern(m)}>
                        <span className="pe-echo-name">Echoes {m.name}</span>
                        <span className="pe-echo-meta">
                          {m.era || patternTypeLabel(m.pattern_type)}
                          {m.match_strength != null && <span className="pe-str">{m.match_strength}/10</span>}
                        </span>
                      </button>
                      <p className="pe-echo-expl">{m.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7 — Study Saves (Option 3 review surface for fp_seminar) */}
      <section className="sem-sec">
        <h2 className="sem-h2"><BookmarkPlus size={18} /> My Saved Cards &amp; Debates</h2>
        <StudySaves
          course="fp_seminar"
          refreshKey={studyRefresh}
          weekLabel={() => "This edition"}
        />
      </section>

      {/* 8 — Carry-Forward (Phase 3 placeholder) */}
      <section id="carry-forward" className="sem-sec">
        <h2 className="sem-h2"><Users size={18} /> Carry-Forward</h2>
        <div className="sem-stub">
          The cross-week <strong>actor map</strong> — who connects to whom over time — is now live.{" "}
          <a href="/seminar/graph" className="sem-cf-link"><Network size={14} /> Open the Live Actor Graph →</a>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            A <strong>cui-bono ledger</strong> (who profits, drawn from the Marxist lens + faction
            sub-maps) arrives in a later phase.
          </div>
        </div>
      </section>
    </div>
  );
}

// =====================================================================
// Party click-in drawer — 5-panel actor dossier.
// =====================================================================
const DRAWER_PANELS = [
  { id: "dp-trajectory", label: "Trajectory" },
  { id: "dp-decoded", label: "Decoded" },
  { id: "dp-act", label: "If acts" },
  { id: "dp-inact", label: "If not" },
  { id: "dp-factions", label: "Factions" },
];

export function ActorDrawer({ name, seminarId, wk, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actor, setActor] = useState(null);
  const [saveState, setSaveState] = useState({});   // {card, submap} -> status
  const [activePanel, setActivePanel] = useState("dp-trajectory");
  const bodyRef = useRef(null);

  useEffect(() => {
    let on = true;
    setLoading(true); setErr(""); setActor(null);
    (async () => {
      try {
        const q = new URLSearchParams({ name });
        if (seminarId != null) q.set("seminar_id", String(seminarId));
        const r = await authFetch(`/api/seminar/actor?${q.toString()}`);
        const j = await r.json();
        if (!on) return;
        if (!j.ok) setErr(j.error || "Could not load this dossier.");
        else setActor(j.actor);
      } catch { if (on) setErr("Network error loading dossier."); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [name, seminarId]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const card = actor && actor.card;

  // Mini-nav scroll-spy inside the drawer body (root = the scrolling body).
  useEffect(() => {
    if (!card || !bodyRef.current) return;
    const root = bodyRef.current;
    const els = DRAWER_PANELS.map((p) => root.querySelector("#" + p.id)).filter(Boolean);
    if (!els.length) return;
    const ratios = new Map();
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
        let best = null, bestR = -1;
        DRAWER_PANELS.forEach((p) => { const r = ratios.get(p.id) || 0; if (r > bestR) { bestR = r; best = p.id; } });
        if (best && bestR > 0) setActivePanel(best);
      },
      { root, rootMargin: "-10px 0px -60% 0px", threshold: [0, 0.2, 0.5, 1] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [card]);

  function jumpPanel(e, id) {
    e.preventDefault();
    const root = bodyRef.current;
    const el = root && root.querySelector("#" + id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActivePanel(id);
  }

  function serveTag(v) {
    const s = String(v || "").toLowerCase();
    const cls = s === "yes" ? "yes" : s === "no" ? "no" : "mixed";
    return <span className={`sem-serve ${cls}`}>{s || "mixed"}</span>;
  }

  async function doSave(kind) {
    if (!card) return;
    setSaveState((s) => ({ ...s, [kind]: "saving" }));
    let payload;
    if (kind === "card") {
      const traj = (card.trajectory || [])
        .map((t) => (typeof t === "string" ? `• ${t}` : `• ${t.date || ""} — ${t.label || ""}${t.desc ? ": " + t.desc : ""}`))
        .join("\n");
      const summary =
        `${actor.name} — actor dossier\n\n` +
        `Decoded position: ${card.current_position_decoded || ""}\n\n` +
        `Trajectory:\n${traj}\n\n` +
        `Action upside:\n${(card.action_upside || []).map((b) => "• " + b).join("\n")}\n\n` +
        `Inaction upside:\n${(card.inaction_upside || []).map((b) => "• " + b).join("\n")}`;
      payload = { wk, summary, transcript: { type: "actor_card", actor: actor.name, card }, title: `${actor.name} — dossier` };
    } else {
      const rows = (card.faction_submap || [])
        .map((f) => `• ${f.name || ""} — wants: ${f.wants || ""} (serves today: ${f.serves_today || "mixed"})`)
        .join("\n");
      payload = {
        wk,
        summary: `${actor.name} — faction sub-map\n\n${rows}`,
        transcript: { type: "faction_submap", actor: actor.name, faction_submap: card.faction_submap || [] },
        title: `${actor.name} — faction sub-map`,
      };
    }
    const j = await postModuleSave(payload);
    setSaveState((s) => ({ ...s, [kind]: j.ok ? "saved" : "error" }));
    if (j.ok && onSaved) onSaved();
  }

  function SaveChip({ kind, label }) {
    const st = saveState[kind];
    return (
      <button className="sem-savebtn" disabled={st === "saving" || st === "saved"} onClick={() => doSave(kind)}>
        {st === "saved" ? <><Check size={13} /> Saved</>
          : st === "saving" ? <><Loader2 size={13} className="sem-spin" /> Saving…</>
          : st === "error" ? <>Retry</>
          : <><BookmarkPlus size={13} /> {label}</>}
      </button>
    );
  }

  return (
    <div className="sem-drawer-overlay" onClick={onClose}>
      <aside className="sem-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${name} dossier`}>
        <div className="sem-drawer-head">
          <div>
            <div className="sem-drawer-kicker"><Network size={13} /> Actor Dossier</div>
            <h3 className="sem-drawer-title">{actor ? actor.name : name}</h3>
            {actor && actor.type && <span className="sem-drawer-type">{actor.type.replace(/_/g, " ")}</span>}
          </div>
          <button className="sem-drawer-x" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        {!loading && card && (
          <nav className="sem-drawer-nav" aria-label="Dossier panels">
            {DRAWER_PANELS.map((p) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                className={`sem-dpill ${activePanel === p.id ? "active" : ""}`}
                onClick={(e) => jumpPanel(e, p.id)}
                aria-current={activePanel === p.id ? "true" : undefined}
              >
                {p.label}
              </a>
            ))}
          </nav>
        )}

        <div className="sem-drawer-body" ref={bodyRef}>
          {loading && <div className="sem-drawer-loading"><Loader2 className="sem-spin" /> Building the dossier…<span>First open generates it; later visits are instant.</span></div>}
          {!loading && err && <div className="sem-drawer-err">{err}</div>}

          {!loading && card && (
            <>
              {/* Panel 1 — Historical trajectory */}
              <div className="sem-panel" id="dp-trajectory">
                <div className="sem-panel-h"><Clock size={15} /> Historical trajectory</div>
                <ol className="sem-traj">
                  {(card.trajectory || []).map((t, i) => (
                    <li key={i}>
                      {typeof t === "string" ? <span className="sem-traj-desc">{t}</span> : (
                        <>
                          <span className="sem-traj-date">{t.date || ""}</span>
                          <span className="sem-traj-body">
                            {t.label && <b>{t.label}</b>}{t.label && t.desc ? " — " : ""}{t.desc || ""}
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Panel 2 — Current position decoded */}
              <div className="sem-panel" id="dp-decoded">
                <div className="sem-panel-h"><Eye size={15} /> Current position, decoded</div>
                <p className="sem-panel-p">{card.current_position_decoded}</p>
              </div>

              {/* Panels 3 + 4 — Action / Inaction upside */}
              <div className="sem-panel-row">
                <div className="sem-panel half" id="dp-act">
                  <div className="sem-panel-h up"><TrendingUp size={15} /> If they act</div>
                  <ul className="sem-upside">{(card.action_upside || []).map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
                <div className="sem-panel half" id="dp-inact">
                  <div className="sem-panel-h down"><Pause size={15} /> If they don't</div>
                  <ul className="sem-upside">{(card.inaction_upside || []).map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              </div>

              {/* Panel 5 — Faction sub-map */}
              <div className="sem-panel" id="dp-factions">
                <div className="sem-panel-h"><Users size={15} /> Faction sub-map</div>
                <div className="sem-submap">
                  <div className="sem-submap-head"><span>Faction</span><span>What it wants</span><span>Serves today?</span></div>
                  {(card.faction_submap || []).map((f, i) => (
                    <div key={i} className="sem-submap-row">
                      <span className="sem-submap-name">{f.name || ""}</span>
                      <span className="sem-submap-wants">{f.wants || ""}</span>
                      <span className="sem-submap-serve">{serveTag(f.serves_today)}</span>
                    </div>
                  ))}
                </div>
                <div className="sem-panel-saves"><SaveChip kind="submap" label="Save faction sub-map" /></div>
              </div>

              <div className="sem-drawer-foot">
                <SaveChip kind="card" label="Save card to module" />
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// =====================================================================
// Debate Room — four personas + live debate.
// =====================================================================
function DebateRoom({ seminarId, wk, onSaved }) {
  const [phase, setPhase] = useState("idle");   // idle | loading | openings | error
  const [openings, setOpenings] = useState([]);
  const [err, setErr] = useState("");
  const [active, setActive] = useState(null);   // selected persona object
  const [savedOpenings, setSavedOpenings] = useState({});

  async function loadOpenings() {
    setPhase("loading"); setErr("");
    try {
      const r = await authFetch(`/api/seminar/debate-openings?seminar_id=${seminarId}`);
      const j = await r.json();
      if (j.ok && Array.isArray(j.openings)) { setOpenings(j.openings); setPhase("openings"); }
      else { setErr(j.error || "Could not load the panel."); setPhase("error"); }
    } catch { setErr("Network error."); setPhase("error"); }
  }

  async function saveOpening(p) {
    setSavedOpenings((s) => ({ ...s, [p.key]: "saving" }));
    const j = await postModuleSave({
      wk,
      summary: `${p.label} (${p.school}) — opening read\n\n${p.opening}`,
      transcript: { type: "persona_opening", persona: p.key, label: p.label, opening: p.opening },
      title: `${p.label} — opening read`,
    });
    setSavedOpenings((s) => ({ ...s, [p.key]: j.ok ? "saved" : "error" }));
    if (j.ok && onSaved) onSaved();
  }

  return (
    <section id="debate" className="sem-sec">
      <h2 className="sem-h2"><Swords size={18} /> Debate Room</h2>

      {phase === "idle" && (
        <div className="sem-stub">
          Four analysts — <strong>Realist</strong>, <strong>Liberal institutionalist</strong>,{" "}
          <strong>Marxist / world-systems</strong>, and <strong>Constructivist</strong> — open on this week's
          event. Pick one and argue back; the thread saves automatically.
          <div style={{ marginTop: 12 }}>
            <button className="sem-savehero" onClick={loadOpenings}>
              <MessageSquare size={15} /> Open the panel
            </button>
          </div>
        </div>
      )}

      {phase === "loading" && <div className="sem-drawer-loading"><Loader2 className="sem-spin" /> Convening the panel…</div>}
      {phase === "error" && <div className="sem-drawer-err">{err} <button className="sem-savebtn" onClick={loadOpenings}>Retry</button></div>}

      {phase === "openings" && !active && (
        <div className="sem-personas">
          {openings.map((p) => (
            <div key={p.key} className={`sem-persona p-${p.key}`}>
              <div className="sem-persona-head">
                <div>
                  <div className="sem-persona-name">{p.label}</div>
                  <div className="sem-persona-school">{p.school}</div>
                </div>
              </div>
              <p className="sem-persona-open">{p.opening}</p>
              <div className="sem-persona-actions">
                <button className="sem-debatebtn" onClick={() => setActive(p)}>
                  <Swords size={13} /> Debate this view <ChevronRight size={13} />
                </button>
                <button
                  className="sem-savebtn"
                  disabled={savedOpenings[p.key] === "saving" || savedOpenings[p.key] === "saved"}
                  onClick={() => saveOpening(p)}
                >
                  {savedOpenings[p.key] === "saved" ? <><Check size={13} /> Saved</>
                    : savedOpenings[p.key] === "saving" ? <><Loader2 size={13} className="sem-spin" /> …</>
                    : savedOpenings[p.key] === "error" ? <>Retry</>
                    : <><BookmarkPlus size={13} /> Save opening</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "openings" && active && (
        <DebateThread
          persona={active}
          seminarId={seminarId}
          wk={wk}
          onBack={() => setActive(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}

function DebateThread({ persona, seminarId, wk, onBack, onSaved }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: persona.opening }]);
  const [debateId, setDebateId] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [resumed, setResumed] = useState(false);

  // Resume an existing thread for this persona, if any.
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await authFetch(`/api/seminar/debates?seminar_id=${seminarId}`);
        const j = await r.json();
        if (!on || !j.ok || !Array.isArray(j.debates)) return;
        const existing = j.debates.find((d) => d.persona === persona.key);
        if (existing && Array.isArray(existing.messages) && existing.messages.length) {
          setMessages(existing.messages);
          setDebateId(existing.id);
        }
      } catch {}
      finally { if (on) setResumed(true); }
    })();
    return () => { on = false; };
  }, [persona.key, seminarId]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    // Build the thread to send: drop the opening (it's a UI seed, not a real
    // assistant turn) so the API sees a clean conversation ending in the user.
    const priorReal = messages.filter((m, i) => !(i === 0 && m.content === persona.opening));
    const outgoing = priorReal.concat([{ role: "user", content: text }]);
    setMessages((m) => m.concat([{ role: "user", content: text }]));
    setInput("");
    try {
      const r = await authFetch("/api/seminar/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seminar_id: seminarId, persona: persona.key, messages: outgoing, debate_id: debateId }),
      });
      const j = await r.json();
      if (j.ok && j.reply) {
        setMessages((m) => m.concat([{ role: "assistant", content: j.reply }]));
        if (j.debate_id) setDebateId(j.debate_id);
      } else {
        setMessages((m) => m.concat([{ role: "assistant", content: "⚠️ " + (j.error || "Could not respond. Try again.") }]));
      }
    } catch {
      setMessages((m) => m.concat([{ role: "assistant", content: "⚠️ Network error. Try again." }]));
    } finally {
      setSending(false);
    }
  }

  async function saveDebate() {
    setSaveState("saving");
    const real = messages.filter((m, i) => !(i === 0 && m.content === persona.opening));
    const lines = real.map((m) => `${m.role === "assistant" ? persona.label : "You"}: ${m.content}`);
    const j = await postModuleSave({
      wk,
      summary: `Debate — ${persona.label} (${persona.school})\n\n` + lines.slice(0, 12).join("\n"),
      transcript: { type: "debate", persona: persona.key, label: persona.label, messages: real },
      title: `Debate — ${persona.label}`,
    });
    setSaveState(j.ok ? "saved" : "error");
    if (j.ok && onSaved) onSaved();
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="sem-thread">
      <div className="sem-thread-head">
        <button className="sem-back" onClick={onBack}><ArrowLeft size={14} /> Panel</button>
        <div className="sem-thread-who"><Swords size={14} /> {persona.label} <span>· {persona.school}</span></div>
        <button
          className="sem-savebtn"
          disabled={saveState === "saving" || saveState === "saved"}
          onClick={saveDebate}
        >
          {saveState === "saved" ? <><Check size={13} /> Saved</>
            : saveState === "saving" ? <><Loader2 size={13} className="sem-spin" /> …</>
            : saveState === "error" ? <>Retry</>
            : <><BookmarkPlus size={13} /> Save debate</>}
        </button>
      </div>

      <div className="sem-thread-msgs">
        {messages.map((m, i) => (
          <div key={i} className={`sem-msg ${m.role}`}>
            <div className="sem-msg-who">{m.role === "assistant" ? persona.label : "You"}</div>
            <div className="sem-msg-text">{m.content}</div>
          </div>
        ))}
        {sending && <div className="sem-msg assistant"><div className="sem-msg-who">{persona.label}</div><div className="sem-msg-text"><Loader2 size={14} className="sem-spin" /> thinking…</div></div>}
      </div>

      <div className="sem-thread-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={`Make your counterargument to the ${persona.label.toLowerCase()}…`}
          disabled={sending}
        />
        <button className="sem-sendbtn" onClick={send} disabled={sending || !input.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

// Sticky horizontal section nav. Smooth-scrolls to each <section id>, tracks
// the in-view section with an IntersectionObserver, and keeps the URL hash in
// sync so a refresh restores the reader's place. Pills scroll horizontally on
// phones (no wrap).
function SectionNav({ items }) {
  const [active, setActive] = useState(items[0] ? items[0].id : "");
  const ids = items.map((i) => i.id).join(",");

  // Scroll-spy: pick the most-visible section.
  useEffect(() => {
    const idList = ids ? ids.split(",") : [];
    const els = idList.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return;
    const ratios = new Map();
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
        let best = null, bestR = -1;
        idList.forEach((id) => {
          const r = ratios.get(id) || 0;
          if (r > bestR) { bestR = r; best = id; }
        });
        if (best && bestR > 0) setActive(best);
      },
      { rootMargin: "-58px 0px -55% 0px", threshold: [0, 0.12, 0.25, 0.5, 1] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);

  // On mount, honour an inbound #hash (sections exist by now).
  useEffect(() => {
    const h = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    if (h && ids.split(",").includes(h)) {
      const el = document.getElementById(h);
      if (el) {
        setActive(h);
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(e, id) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState(null, "", "#" + id);
    }
  }

  return (
    <nav className="sem-nav" aria-label="Seminar sections">
      <div className="sem-nav-row">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            className={`sem-pill ${active === it.id ? "active" : ""}`}
            onClick={(e) => go(e, it.id)}
            aria-current={active === it.id ? "true" : undefined}
          >
            {it.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function TopBar({ savedCount }) {
  return (
    <div className="sem-topbar">
      <a href="/" className="sem-back"><ArrowLeft size={15} /> Portal</a>
      <a href="/seminar/graph" className="sem-archlink"><Network size={13} /> Actor Graph</a>
      <a href="/seminar/patterns" className="sem-archlink"><Library size={13} /> Patterns</a>
      <a href="/seminar/theories" className="sem-archlink"><BookMarked size={13} /> Theories</a>
      <a href="/seminar/archive" className="sem-archlink">Archive</a>
      <span className="sem-savecount">{savedCount > 0 ? `${savedCount} saved this week` : ""}</span>
    </div>
  );
}
