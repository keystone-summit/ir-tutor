"use client";
// =====================================================================
// Phase 3a — Live Actor Graph.
//
// A force-directed map of how the seminar's named entities relate (allies,
// opposes, finances, owns, …). Nodes are coloured by entity type, edges by
// relation type with thickness = weight. Clicking a node opens the SAME
// 5-panel ActorDrawer built in Phase 2 (imported, not rebuilt); clicking an
// edge shows its evidence + source. A right sidebar filters by entity/relation
// type, a search box highlights an entity + its 1-hop neighbourhood, and a
// "Path between" mode dims everything except the shortest chain between two
// entities. On phones (<768px) it falls back to a grouped, expandable list.
// "Save graph view" drops a snapshot into Study Saves via the Option-3 flow.
// =====================================================================
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Network, ArrowLeft, Search, X, Route, BookmarkPlus, Check, Loader2,
  Filter, ExternalLink, Users, Eye, RotateCcw,
} from "lucide-react";
import { authFetch } from "../../../lib/clientAuth";
import { ActorDrawer, postModuleSave } from "../SeminarView";

// react-force-graph touches window at import → client-only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// ---- palettes ----
const ENTITY_COLORS = {
  state: "#3b6fb0",
  individual: "#cda24f",
  org: "#2d8a7a",
  ngo: "#4f9d5a",
  mnc: "#8a5db0",
  armed_group: "#b8503b",
  institution: "#5b6b80",
};
const ENTITY_LABELS = {
  state: "State", individual: "Individual", org: "Organisation", ngo: "NGO",
  mnc: "Multinational", armed_group: "Armed group", institution: "Institution",
};
const RELATION_COLORS = {
  allies: "#3f9d5a",
  opposes: "#c0492f",
  finances: "#caa23f",
  funded_by: "#d98a3a",
  owns: "#8a5db0",
  aligned_with: "#2d8a7a",
  employs: "#3b6fb0",
  family: "#c06aa0",
  professional: "#5b6b80",
  related_to: "#9a9384",
};
const RELATION_LABELS = {
  allies: "allies", opposes: "opposes", finances: "finances", funded_by: "funded by",
  owns: "owns", aligned_with: "aligned with", employs: "employs", family: "family",
  professional: "professional", related_to: "related to",
};
const DIM_NODE = "#cdc6b4";
const DIM_LINK = "rgba(120,115,100,0.10)";

function entityColor(t) { return ENTITY_COLORS[t] || ENTITY_COLORS.org; }
function relationColor(t) { return RELATION_COLORS[t] || RELATION_COLORS.related_to; }
function widthForWeight(w) { return w >= 3 ? 4 : w === 2 ? 2.4 : 1.1; }

// chat_saves week bucket — same scheme SeminarView uses.
function weekKeyOf(weekStart) {
  if (!weekStart) return 0;
  const t = Date.parse(String(weekStart).slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(t) ? Math.floor(t / (7 * 86400000)) : 0;
}

export default function GraphView() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [raw, setRaw] = useState(null);          // { nodes, edges, entity_types, relation_types }
  const [wk, setWk] = useState(0);

  const [enabledTypes, setEnabledTypes] = useState(null);   // Set | null (all)
  const [enabledRels, setEnabledRels] = useState(null);     // Set | null (all)
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState("");                   // committed search

  const [pathMode, setPathMode] = useState(false);
  const [pathA, setPathA] = useState(null);
  const [pathB, setPathB] = useState(null);

  const [activeParty, setActiveParty] = useState("");
  const [popover, setPopover] = useState(null);             // { x, y, ...edge }
  const [saveState, setSaveState] = useState("");

  const [isMobile, setIsMobile] = useState(false);
  const [showGraphMobile, setShowGraphMobile] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  const fgRef = useRef(null);
  const canvasWrapRef = useRef(null);

  // ---- responsive ----
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", apply) : mq.removeListener(apply); };
  }, []);

  // ---- size the canvas to its container ----
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({ width: el.clientWidth || 800, height: el.clientHeight || 600 });
    });
    ro.observe(el);
    setDims({ width: el.clientWidth || 800, height: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, [loading, isMobile, showGraphMobile]);

  // ---- load graph + the current edition's week bucket (for saves) ----
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [gr, cur] = await Promise.all([
          authFetch("/api/seminar/graph-data").then((r) => r.json()).catch(() => ({ ok: false })),
          authFetch("/api/seminar/current").then((r) => r.json()).catch(() => ({ ok: false })),
        ]);
        if (!on) return;
        if (!gr.ok) { setErr(gr.error || "Could not load the actor graph."); }
        else { setRaw(gr); }
        if (cur && cur.ok && cur.edition) setWk(weekKeyOf(cur.edition.week_start_date));
      } catch {
        if (on) setErr("Network error loading the graph.");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  // ---- stable graphData clone for the force engine (engine mutates its copy) ----
  const graphData = useMemo(() => {
    if (!raw) return { nodes: [], links: [] };
    return {
      nodes: raw.nodes.map((n) => ({ ...n })),
      links: raw.edges.map((e) => ({ ...e })),
    };
  }, [raw]);

  const nodeById = useMemo(() => {
    const m = new Map();
    (raw ? raw.nodes : []).forEach((n) => m.set(n.id, n));
    return m;
  }, [raw]);

  // Adjacency over edges that pass the CURRENT filters (for BFS + search hops).
  const typeOn = useCallback((t) => !enabledTypes || enabledTypes.has(t), [enabledTypes]);
  const relOn = useCallback((t) => !enabledRels || enabledRels.has(t), [enabledRels]);
  const nodeVisible = useCallback(
    (id) => { const n = nodeById.get(id); return n ? typeOn(n.entity_type) : false; },
    [nodeById, typeOn]
  );
  const edgeVisible = useCallback(
    (e) => relOn(e.relation_type) && nodeVisible(e.source) && nodeVisible(e.target),
    [relOn, nodeVisible]
  );

  const adjacency = useMemo(() => {
    const adj = new Map();   // id -> [{ other, edgeId }]
    if (!raw) return adj;
    raw.edges.forEach((e) => {
      if (!edgeVisible(e)) return;
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source).push({ other: e.target, edgeId: e.id });
      adj.get(e.target).push({ other: e.source, edgeId: e.id });
    });
    return adj;
  }, [raw, edgeVisible]);

  // ---- shortest path (BFS, undirected, over visible edges) ----
  const pathResult = useMemo(() => {
    if (!pathMode || pathA == null || pathB == null || pathA === pathB) return null;
    const prev = new Map();
    const prevEdge = new Map();
    const q = [pathA];
    const seen = new Set([pathA]);
    let found = false;
    while (q.length) {
      const cur = q.shift();
      if (cur === pathB) { found = true; break; }
      for (const { other, edgeId } of adjacency.get(cur) || []) {
        if (!seen.has(other)) {
          seen.add(other);
          prev.set(other, cur);
          prevEdge.set(other, edgeId);
          q.push(other);
        }
      }
    }
    if (!found) return { nodes: new Set(), edges: new Set(), none: true };
    const nodes = new Set();
    const edges = new Set();
    let cur = pathB;
    nodes.add(cur);
    while (cur !== pathA) {
      edges.add(prevEdge.get(cur));
      cur = prev.get(cur);
      nodes.add(cur);
    }
    return { nodes, edges, none: false };
  }, [pathMode, pathA, pathB, adjacency]);

  // ---- search focus (matched nodes + 1-hop neighbours) ----
  const searchResult = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !raw) return null;
    const matched = raw.nodes
      .filter((n) => typeOn(n.entity_type) && n.name.toLowerCase().includes(q))
      .map((n) => n.id);
    if (!matched.length) return { nodes: new Set(), edges: new Set(), empty: true };
    const nodes = new Set(matched);
    const edges = new Set();
    matched.forEach((id) => {
      (adjacency.get(id) || []).forEach(({ other, edgeId }) => { nodes.add(other); edges.add(edgeId); });
    });
    return { nodes, edges, empty: false };
  }, [query, raw, adjacency, typeOn]);

  // The active focus set (path takes precedence over search).
  const focus = useMemo(() => {
    if (pathResult && !pathResult.none) return pathResult;
    if (searchResult && !searchResult.empty) return searchResult;
    return null;
  }, [pathResult, searchResult]);

  const focusActive = !!focus;
  const focusNodes = focus ? focus.nodes : null;
  const focusEdges = focus ? focus.edges : null;

  // ---- force-graph accessors ----
  const nodeColor = useCallback((n) => {
    if (focusActive && !focusNodes.has(n.id)) return DIM_NODE;
    return entityColor(n.entity_type);
  }, [focusActive, focusNodes]);

  const nodeVal = useCallback((n) => 1 + Math.min(8, Math.sqrt(n.degree || 1)), []);

  const paintLabel = useCallback((node, ctx, globalScale) => {
    const emphasised = focusActive && focusNodes.has(node.id);
    if (globalScale < 1.3 && !emphasised) return;     // declutter when zoomed out
    const label = node.name;
    const fontSize = Math.max(3.2, 11 / globalScale);
    ctx.font = `${emphasised ? 600 : 400} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    const r = (1 + Math.min(8, Math.sqrt(node.degree || 1))) * 1.6;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = focusActive && !focusNodes.has(node.id) ? "rgba(90,85,72,0.4)" : "#1c2738";
    ctx.fillText(label, node.x + r + 1.5 / globalScale, node.y);
  }, [focusActive, focusNodes]);

  const linkColor = useCallback((l) => {
    if (focusActive && !focusEdges.has(l.id)) return DIM_LINK;
    return relationColor(l.relation_type);
  }, [focusActive, focusEdges]);

  const linkWidth = useCallback((l) => {
    const base = widthForWeight(l.weight);
    if (focusActive && focusEdges.has(l.id)) return base + 1.6;
    return base;
  }, [focusActive, focusEdges]);

  const nodeVisibility = useCallback((n) => typeOn(n.entity_type), [typeOn]);
  const linkVisibility = useCallback((l) => {
    const s = typeof l.source === "object" ? l.source.entity_type : nodeById.get(l.source)?.entity_type;
    const t = typeof l.target === "object" ? l.target.entity_type : nodeById.get(l.target)?.entity_type;
    return relOn(l.relation_type) && typeOn(s) && typeOn(t);
  }, [relOn, typeOn, nodeById]);

  const onNodeClick = useCallback((node) => {
    if (pathMode) {
      if (pathA == null) { setPathA(node.id); setPathB(null); }
      else if (pathB == null) { if (node.id !== pathA) setPathB(node.id); }
      else { setPathA(node.id); setPathB(null); }   // both set → restart from here
      return;
    }
    setPopover(null);
    setActiveParty(node.name);
  }, [pathMode, pathA, pathB]);

  const onLinkClick = useCallback((link, ev) => {
    const sx = ev && (ev.clientX != null ? ev.clientX : (ev.pageX || 0));
    const sy = ev && (ev.clientY != null ? ev.clientY : (ev.pageY || 0));
    const fromName = typeof link.source === "object" ? link.source.name : nodeById.get(link.source)?.name;
    const toName = typeof link.target === "object" ? link.target.name : nodeById.get(link.target)?.name;
    setPopover({
      x: Math.min(sx, (typeof window !== "undefined" ? window.innerWidth : 1000) - 300),
      y: sy,
      from: fromName, to: toName,
      relation_type: link.relation_type, evidence: link.evidence,
      source_url: link.source_url, weight: link.weight,
    });
  }, [nodeById]);

  // Fit on first stabilisation.
  const fittedRef = useRef(false);
  const onEngineStop = useCallback(() => {
    if (fittedRef.current || !fgRef.current) return;
    fittedRef.current = true;
    try { fgRef.current.zoomToFit(500, 50); } catch {}
  }, []);

  // ---- filter toggles ----
  const allTypes = raw ? raw.entity_types : [];
  const allRels = raw ? raw.relation_types : [];
  function toggleType(t) {
    setEnabledTypes((cur) => {
      const base = cur ? new Set(cur) : new Set(allTypes);
      base.has(t) ? base.delete(t) : base.add(t);
      return base.size === allTypes.length ? null : base;
    });
  }
  function toggleRel(t) {
    setEnabledRels((cur) => {
      const base = cur ? new Set(cur) : new Set(allRels);
      base.has(t) ? base.delete(t) : base.add(t);
      return base.size === allRels.length ? null : base;
    });
  }
  function resetFilters() {
    setEnabledTypes(null); setEnabledRels(null);
    setQuery(""); setSearchTerm("");
    setPathMode(false); setPathA(null); setPathB(null);
  }

  function submitSearch(e) {
    if (e) e.preventDefault();
    setQuery(searchTerm);
    setPathMode(false); setPathA(null); setPathB(null);
  }

  function togglePathMode() {
    setPathMode((m) => {
      const next = !m;
      setPathA(null); setPathB(null);
      if (next) { setQuery(""); setSearchTerm(""); }
      return next;
    });
  }

  // ---- save the current view (Option 3) ----
  async function saveView() {
    if (!raw) return;
    setSaveState("saving");
    const visNodes = raw.nodes.filter((n) => typeOn(n.entity_type));
    const visEdges = raw.edges.filter((e) => edgeVisible(e));
    const topEdges = [...visEdges].sort((a, b) => b.weight - a.weight).slice(0, 12);
    const focusLabel = query.trim()
      ? `${query.trim()} focus`
      : (pathMode && pathA != null && pathB != null
          ? `${nodeById.get(pathA)?.name} ↔ ${nodeById.get(pathB)?.name} path`
          : "Full graph");
    const lines = topEdges.map((e) => {
      const f = nodeById.get(e.source)?.name || e.source;
      const t = nodeById.get(e.target)?.name || e.target;
      return `• ${f} —[${RELATION_LABELS[e.relation_type] || e.relation_type}]→ ${t}${e.evidence ? `: ${e.evidence}` : ""}`;
    });
    const typeFilter = enabledTypes ? Array.from(enabledTypes).join(", ") : "all entity types";
    const relFilter = enabledRels ? Array.from(enabledRels).join(", ") : "all relation types";
    const summary =
      `Actor graph snapshot — ${focusLabel}\n` +
      `${visNodes.length} entities · ${visEdges.length} relationships\n` +
      `Filters: ${typeFilter}; ${relFilter}\n\n` +
      `Strongest ties:\n${lines.join("\n")}`;
    const title = `Actor graph — ${focusLabel}`.slice(0, 120);
    const j = await postModuleSave({
      wk,
      summary,
      transcript: {
        type: "actor_graph_view",
        focus: focusLabel,
        filters: { entity_types: enabledTypes ? Array.from(enabledTypes) : "all", relation_types: enabledRels ? Array.from(enabledRels) : "all" },
        counts: { nodes: visNodes.length, edges: visEdges.length },
        top_edges: topEdges.map((e) => ({
          from: nodeById.get(e.source)?.name, to: nodeById.get(e.target)?.name,
          relation_type: e.relation_type, weight: e.weight, evidence: e.evidence,
        })),
      },
      title,
    });
    setSaveState(j && j.ok ? "saved" : "error");
    if (j && j.ok) setTimeout(() => setSaveState(""), 2200);
  }

  // =====================================================================
  // render
  // =====================================================================
  const counts = raw ? raw.counts : { nodes: 0, edges: 0 };

  return (
    <div className="gr-shell">
      {activeParty && (
        <ActorDrawer
          name={activeParty}
          seminarId={null}
          wk={wk}
          onClose={() => setActiveParty("")}
          onSaved={() => {}}
        />
      )}

      {/* top bar */}
      <div className="gr-top">
        <a href="/seminar" className="gr-back"><ArrowLeft size={15} /> Seminar</a>
        <div className="gr-title"><Network size={15} /> Live Actor Graph</div>
        <div className="gr-counts">{counts.nodes} entities · {counts.edges} ties</div>
        <form className="gr-search" onSubmit={submitSearch}>
          <Search size={14} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search entity (e.g. Iran)…"
            aria-label="Search entity"
          />
          {query && (
            <button type="button" className="gr-search-x" onClick={() => { setQuery(""); setSearchTerm(""); }} aria-label="Clear search"><X size={13} /></button>
          )}
        </form>
        <button
          className={`gr-toolbtn ${pathMode ? "on" : ""}`}
          onClick={togglePathMode}
          title="Pick two entities to highlight the shortest path between them"
        >
          <Route size={14} /> Path between
        </button>
        <button className="gr-toolbtn gr-savebtn" onClick={saveView} disabled={saveState === "saving"}>
          {saveState === "saved" ? <><Check size={14} /> Saved</>
            : saveState === "saving" ? <><Loader2 size={14} className="sem-spin" /> Saving…</>
            : saveState === "error" ? <>Retry save</>
            : <><BookmarkPlus size={14} /> Save view</>}
        </button>
        <button className="gr-toolbtn gr-filtbtn" onClick={() => setShowFilters((s) => !s)} title="Filters">
          <Filter size={14} /> Filters
        </button>
      </div>

      {/* path-mode helper banner */}
      {pathMode && (
        <div className="gr-pathbar">
          <Route size={13} />
          {pathA == null
            ? "Click the first entity…"
            : pathB == null
              ? <>From <b>{nodeById.get(pathA)?.name}</b> — now click the destination entity…</>
              : pathResult && pathResult.none
                ? <>No visible path between <b>{nodeById.get(pathA)?.name}</b> and <b>{nodeById.get(pathB)?.name}</b> under the current filters.</>
                : <>Shortest path: <b>{nodeById.get(pathA)?.name}</b> → <b>{nodeById.get(pathB)?.name}</b> ({focusEdges ? focusEdges.size : 0} hops). Click a node to restart.</>}
          <button className="gr-search-x" onClick={() => { setPathA(null); setPathB(null); }} aria-label="Reset path"><RotateCcw size={13} /></button>
        </div>
      )}

      <div className="gr-body">
        {/* main stage */}
        <div className="gr-stage" ref={canvasWrapRef}>
          {loading && <div className="gr-center"><Loader2 className="sem-spin" /> Loading the actor graph…</div>}
          {!loading && err && <div className="gr-center gr-err">{err}</div>}
          {!loading && !err && counts.edges === 0 && (
            <div className="gr-center">
              <Network size={34} />
              <p>No relationships have been extracted yet.</p>
              <span>The graph fills in after the weekly extraction runs.</span>
            </div>
          )}

          {/* desktop: canvas. mobile: list (with optional canvas). */}
          {!loading && !err && counts.edges > 0 && (
            isMobile && !showGraphMobile ? (
              <MobileList
                raw={raw}
                nodeById={nodeById}
                typeOn={typeOn}
                edgeVisible={edgeVisible}
                onParty={setActiveParty}
                onShowGraph={() => setShowGraphMobile(true)}
              />
            ) : (
              <>
                {isMobile && (
                  <button className="gr-mobile-toggle" onClick={() => setShowGraphMobile(false)}>
                    <Users size={13} /> List view
                  </button>
                )}
                <ForceGraph2D
                  ref={fgRef}
                  width={dims.width}
                  height={dims.height}
                  graphData={graphData}
                  backgroundColor="#f4efe3"
                  nodeId="id"
                  nodeLabel={(n) => `${n.name} — ${ENTITY_LABELS[n.entity_type] || n.entity_type}`}
                  nodeColor={nodeColor}
                  nodeVal={nodeVal}
                  nodeRelSize={3}
                  nodeVisibility={nodeVisibility}
                  nodeCanvasObjectMode={() => "after"}
                  nodeCanvasObject={paintLabel}
                  linkColor={linkColor}
                  linkWidth={linkWidth}
                  linkVisibility={linkVisibility}
                  linkDirectionalArrowLength={3.5}
                  linkDirectionalArrowRelPos={1}
                  linkLabel={(l) => RELATION_LABELS[l.relation_type] || l.relation_type}
                  onNodeClick={onNodeClick}
                  onLinkClick={onLinkClick}
                  onBackgroundClick={() => setPopover(null)}
                  cooldownTicks={120}
                  onEngineStop={onEngineStop}
                />
              </>
            )
          )}

          {/* edge popover */}
          {popover && (
            <div className="gr-pop" style={{ left: Math.max(8, popover.x), top: Math.max(64, popover.y) }} role="dialog">
              <div className="gr-pop-head">
                <span className="gr-pop-rel" style={{ background: relationColor(popover.relation_type) }}>
                  {RELATION_LABELS[popover.relation_type] || popover.relation_type}
                </span>
                <button className="gr-search-x" onClick={() => setPopover(null)} aria-label="Close"><X size={14} /></button>
              </div>
              <div className="gr-pop-pair"><b>{popover.from}</b> → <b>{popover.to}</b></div>
              {popover.evidence && <p className="gr-pop-ev">{popover.evidence}</p>}
              {popover.source_url && (
                <a className="gr-pop-src" href={popover.source_url} target="_blank" rel="noopener noreferrer">
                  source <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </div>

        {/* sidebar / filters */}
        <aside className={`gr-side ${showFilters ? "open" : ""}`}>
          <div className="gr-side-head">
            <span><Filter size={13} /> Filters</span>
            <button className="gr-side-reset" onClick={resetFilters}><RotateCcw size={12} /> Reset</button>
          </div>

          <div className="gr-side-sec">
            <div className="gr-side-lbl">Entity type</div>
            {allTypes.map((t) => (
              <label key={t} className="gr-check">
                <input type="checkbox" checked={typeOn(t)} onChange={() => toggleType(t)} />
                <span className="gr-swatch" style={{ background: entityColor(t) }} />
                {ENTITY_LABELS[t] || t}
              </label>
            ))}
          </div>

          <div className="gr-side-sec">
            <div className="gr-side-lbl">Relation type</div>
            {allRels.map((t) => (
              <label key={t} className="gr-check">
                <input type="checkbox" checked={relOn(t)} onChange={() => toggleRel(t)} />
                <span className="gr-swatch line" style={{ background: relationColor(t) }} />
                {RELATION_LABELS[t] || t}
              </label>
            ))}
          </div>

          <div className="gr-side-hint">
            <Eye size={12} /> Tap a node for its full dossier · tap an edge for the evidence behind the tie.
          </div>
        </aside>
      </div>

      {/* legend (entity colours), always visible */}
      <div className="gr-legend">
        {allTypes.map((t) => (
          <span key={t} className="gr-leg-item">
            <span className="gr-swatch" style={{ background: entityColor(t) }} /> {ENTITY_LABELS[t] || t}
          </span>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// Mobile fallback — entities grouped by type, expandable to their ties.
// =====================================================================
function MobileList({ raw, nodeById, typeOn, edgeVisible, onParty, onShowGraph }) {
  const [open, setOpen] = useState({});
  const grouped = useMemo(() => {
    const g = new Map();
    raw.nodes.filter((n) => typeOn(n.entity_type)).forEach((n) => {
      if (!g.has(n.entity_type)) g.set(n.entity_type, []);
      g.get(n.entity_type).push(n);
    });
    for (const arr of g.values()) arr.sort((a, b) => (b.degree || 0) - (a.degree || 0));
    return g;
  }, [raw, typeOn]);

  const tiesOf = useCallback((id) => {
    return raw.edges
      .filter((e) => edgeVisible(e) && (e.source === id || e.target === id))
      .map((e) => {
        const otherId = e.source === id ? e.target : e.source;
        const dir = e.source === id ? "→" : "←";
        return { otherId, otherName: nodeById.get(otherId)?.name || otherId, rel: e.relation_type, dir, evidence: e.evidence };
      });
  }, [raw, edgeVisible, nodeById]);

  return (
    <div className="gr-mlist">
      <div className="gr-mlist-top">
        <span><Users size={14} /> Entities by type</span>
        <button className="gr-mobile-toggle" onClick={onShowGraph}><Network size={13} /> Graph view</button>
      </div>
      {Array.from(grouped.entries()).map(([type, nodes]) => (
        <div key={type} className="gr-mgroup">
          <div className="gr-mgroup-h">
            <span className="gr-swatch" style={{ background: entityColor(type) }} />
            {ENTITY_LABELS[type] || type} <span className="gr-mgroup-n">{nodes.length}</span>
          </div>
          {nodes.map((n) => {
            const isOpen = open[n.id];
            const ties = isOpen ? tiesOf(n.id) : [];
            return (
              <div key={n.id} className="gr-mrow">
                <div className="gr-mrow-h">
                  <button className="gr-mname" onClick={() => onParty(n.name)}>{n.name}</button>
                  <button className="gr-mexpand" onClick={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))}>
                    {n.degree || 0} ties {isOpen ? "▴" : "▾"}
                  </button>
                </div>
                {isOpen && (
                  <ul className="gr-mties">
                    {ties.length === 0 && <li className="gr-mtie-none">No ties under current filters.</li>}
                    {ties.map((t, i) => (
                      <li key={i} className="gr-mtie">
                        <span className="gr-mtie-rel" style={{ color: relationColor(t.rel) }}>{t.dir} {RELATION_LABELS[t.rel] || t.rel} {t.dir}</span>
                        <button className="gr-mtie-other" onClick={() => onParty(t.otherName)}>{t.otherName}</button>
                        {t.evidence && <span className="gr-mtie-ev">{t.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
