"use client";
// /leaders — Quick-brief grid of all 57 countries with sort + filter controls.
// Sits in the Keystone Summit design system; NO auth (task requirement:
// publicly loadable via curl + Chrome for verification).
//
// HOTFIX 3 (2026-07-19): filter state is now URL-synced via useSearchParams +
// router.replace. Deep-links, refresh, and browser back-button all preserve
// the sort / nuclear / region / minPower / search state. The visual UI is
// unchanged — only the state plumbing switched from useState-only to
// useState-hydrated-from-URL, with a debounced replace() on every change.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search, Radiation, ListFilter } from "lucide-react";
import { REGIONS } from "../../lib/leadersMeta";

const NUCLEAR_FILTERS = [
  { key: "all", label: "All" },
  { key: "yes", label: "Nuclear" },
  { key: "host", label: "Hosts weapons" },
  { key: "no", label: "Non-nuclear" },
];
const SORT_OPTIONS = [
  { key: "rank", label: "Rank (default)" },
  { key: "name", label: "Name (A–Z)" },
  { key: "power", label: "Power (high → low)" },
  { key: "nuclear", label: "Nuclear (grouped)" },
];
const NUCLEAR_ORDER = { yes: 0, host: 1, no: 2 };

// URL param defaults. Values matching these are DROPPED from the URL so a
// clean /leaders visit stays clean (no ?sort=rank&nuclear=all... clutter).
const DEFAULTS = { sort: "rank", nuclear: "all", region: "all", minPower: 0, search: "" };
const VALID_SORTS = new Set(SORT_OPTIONS.map((s) => s.key));
const VALID_NUCLEAR = new Set(NUCLEAR_FILTERS.map((f) => f.key));

function nuclearIcon(cat) {
  if (cat === "yes") return { char: "☢", tone: "nuc-yes", title: "Nuclear state" };
  if (cat === "host") return { char: "☢", tone: "nuc-host", title: "Hosts foreign weapons" };
  return { char: "", tone: "nuc-no", title: "Non-nuclear" };
}

function parseSearchParams(sp) {
  // Parse + validate URL search params into filter state. Any invalid value
  // silently falls back to the default so a bad deep-link doesn't crash.
  const sort = sp.get("sort");
  const nuclear = sp.get("nuclear");
  const region = sp.get("region");
  const minPowerRaw = sp.get("minPower");
  const search = sp.get("search");
  const minPowerNum = Number(minPowerRaw);
  return {
    sort: VALID_SORTS.has(sort) ? sort : DEFAULTS.sort,
    nuclear: VALID_NUCLEAR.has(nuclear) ? nuclear : DEFAULTS.nuclear,
    region: region || DEFAULTS.region,
    minPower: Number.isFinite(minPowerNum) && minPowerNum >= 0 && minPowerNum <= 100
      ? Math.round(minPowerNum) : DEFAULTS.minPower,
    search: search || DEFAULTS.search,
  };
}

function buildQuery(state) {
  // Reverse of parseSearchParams: only serialize values that DIFFER from the
  // default, and always in a stable key order so the URL is deterministic.
  const parts = [];
  if (state.nuclear !== DEFAULTS.nuclear) parts.push(["nuclear", state.nuclear]);
  if (state.region !== DEFAULTS.region) parts.push(["region", state.region]);
  if (state.minPower !== DEFAULTS.minPower) parts.push(["minPower", String(state.minPower)]);
  if (state.search !== DEFAULTS.search) parts.push(["search", state.search]);
  if (state.sort !== DEFAULTS.sort) parts.push(["sort", state.sort]);
  if (parts.length === 0) return "";
  const usp = new URLSearchParams(parts);
  return `?${usp.toString()}`;
}

function LeadersOverviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Seed state from URL params on first render (deep-link support). Subsequent
  // URL changes (e.g. back button) re-hydrate via the effect below.
  const initial = useMemo(() => parseSearchParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [sort, setSort] = useState(initial.sort);
  const [nuclear, setNuclear] = useState(initial.nuclear);
  const [minPower, setMinPower] = useState(initial.minPower);
  const [region, setRegion] = useState(initial.region);
  const [search, setSearch] = useState(initial.search);

  // Load the 57-country dataset once.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/leaders/list")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok) setRows(j.leaders || []);
        else setErr(j?.error || "Failed to load leaders.");
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  // Re-hydrate filter state from the URL when the user navigates (back/forward
  // button, or an in-app <Link> that changes the query). Compares against the
  // current state to avoid a self-triggered loop.
  useEffect(() => {
    const parsed = parseSearchParams(searchParams);
    if (parsed.sort !== sort) setSort(parsed.sort);
    if (parsed.nuclear !== nuclear) setNuclear(parsed.nuclear);
    if (parsed.region !== region) setRegion(parsed.region);
    if (parsed.minPower !== minPower) setMinPower(parsed.minPower);
    if (parsed.search !== search) setSearch(parsed.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Push filter state to the URL. router.replace() (not push) keeps back-button
  // sanity — one entry per navigation, not one entry per keystroke.
  const syncUrl = useCallback((next) => {
    const qs = buildQuery(next);
    // Skip the write if the URL is already correct (avoids a needless render).
    const current = typeof window !== "undefined" ? window.location.search : "";
    if (qs === current || (qs === "" && current === "")) return;
    router.replace(`/leaders${qs}`, { scroll: false });
  }, [router]);

  // Every state setter mirror also nudges the URL. Because the URL is derived
  // strictly from state, we build the "next" object explicitly per setter.
  const updateSort = (v) => { setSort(v); syncUrl({ sort: v, nuclear, region, minPower, search }); };
  const updateNuclear = (v) => { setNuclear(v); syncUrl({ sort, nuclear: v, region, minPower, search }); };
  const updateRegion = (v) => { setRegion(v); syncUrl({ sort, nuclear, region: v, minPower, search }); };
  const updateMinPower = (v) => { setMinPower(v); syncUrl({ sort, nuclear, region, minPower: v, search }); };
  const updateSearch = (v) => { setSearch(v); syncUrl({ sort, nuclear, region, minPower, search: v }); };

  const filtered = useMemo(() => {
    let out = rows.slice();
    if (nuclear !== "all") out = out.filter((r) => r.nuclear_category === nuclear);
    if (minPower > 0) out = out.filter((r) => (r.power ?? 0) >= minPower);
    if (region !== "all") out = out.filter((r) => r.region === region);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      out = out.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.leader || "").toLowerCase().includes(q)
      );
    }
    if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "power") out.sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    else if (sort === "nuclear") {
      out.sort((a, b) => {
        const na = NUCLEAR_ORDER[a.nuclear_category] ?? 9;
        const nb = NUCLEAR_ORDER[b.nuclear_category] ?? 9;
        if (na !== nb) return na - nb;
        return (a.rank ?? 999) - (b.rank ?? 999);
      });
    } else {
      out.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    }
    return out;
  }, [rows, sort, nuclear, minPower, region, search]);

  const regionOptions = useMemo(() => Object.keys(REGIONS).sort(), []);

  return (
    <div className="ldr-root">
      <header className="ldr-top">
        <Link href="/" className="ldr-back" aria-label="Back to portal">
          <ArrowLeft size={16} /> Portal
        </Link>
        <div className="ldr-brand">
          <div className="ldr-code">KEYSTONE ATLAS</div>
          <div className="ldr-name">World Leaders — 57</div>
        </div>
        <nav className="ldr-topnav">
          <Link href="/leaders" className="ldr-topnav-item on">Overview</Link>
          <Link href="/leaders/study" className="ldr-topnav-item">Study Mode</Link>
        </nav>
      </header>

      <main className="ldr-main">
        <div className="ldr-controls">
          <label className="ldr-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search country or leader…"
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
            />
          </label>

          <div className="ldr-control">
            <span className="ldr-lbl"><ListFilter size={13} /> Sort</span>
            <select value={sort} onChange={(e) => updateSort(e.target.value)}>
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="ldr-control">
            <span className="ldr-lbl"><Radiation size={13} /> Nuclear</span>
            <div className="ldr-chips">
              {NUCLEAR_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`ldr-chip ${nuclear === f.key ? "on" : ""}`}
                  onClick={() => updateNuclear(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ldr-control">
            <span className="ldr-lbl">Region</span>
            <select value={region} onChange={(e) => updateRegion(e.target.value)}>
              <option value="all">All regions</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="ldr-control">
            <span className="ldr-lbl">Min power: <b>{minPower}</b></span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={minPower}
              onChange={(e) => updateMinPower(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="ldr-count">
          {loading ? "Loading…" : err ? err : `${filtered.length} of ${rows.length} countries`}
        </div>

        <div className="ldr-grid">
          {filtered.map((c) => {
            const nuc = nuclearIcon(c.nuclear_category);
            return (
              <Link key={c.slug} href={`/leaders/${c.slug}`} className={`ldr-tile ${nuc.tone}`}>
                <div className="ldr-tile-top">
                  <span className="ldr-rank">#{c.rank}</span>
                  <span className="ldr-flag" aria-hidden>{c.flag || "🏳"}</span>
                  {nuc.char && (
                    <span className={`ldr-nuc ${nuc.tone}`} title={nuc.title}>
                      {nuc.char}
                    </span>
                  )}
                </div>
                <h3 className="ldr-tile-name">{c.name}</h3>
                <div className="ldr-tile-meta">
                  <span className="ldr-power" title="Power score">Power {c.power}</span>
                  <span className="ldr-region">{c.region}</span>
                </div>
              </Link>
            );
          })}
          {!loading && !err && filtered.length === 0 && (
            <div className="ldr-empty">No countries match those filters.</div>
          )}
        </div>
      </main>
    </div>
  );
}

// Next 14 requires useSearchParams() to sit inside a Suspense boundary so
// the enclosing page can be pre-rendered without deopting the whole tree.
export default function LeadersOverviewPage() {
  return (
    <Suspense fallback={<div className="ldr-root"><main className="ldr-main"><div className="ldr-count">Loading…</div></main></div>}>
      <LeadersOverviewInner />
    </Suspense>
  );
}
