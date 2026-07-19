"use client";
// /leaders — Quick-brief grid of all 57 countries with sort + filter controls.
// Sits in the Keystone Summit design system; NO auth (task requirement: publicly
// loadable via curl + Chrome for verification).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

function nuclearIcon(cat) {
  if (cat === "yes") return { char: "☢", tone: "nuc-yes", title: "Nuclear state" };
  if (cat === "host") return { char: "☢", tone: "nuc-host", title: "Hosts foreign weapons" };
  return { char: "", tone: "nuc-no", title: "Non-nuclear" };
}

export default function LeadersOverviewPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [sort, setSort] = useState("rank");
  const [nuclear, setNuclear] = useState("all");
  const [minPower, setMinPower] = useState(0);
  const [region, setRegion] = useState("all");
  const [search, setSearch] = useState("");

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
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="ldr-control">
            <span className="ldr-lbl"><ListFilter size={13} /> Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
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
                  onClick={() => setNuclear(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ldr-control">
            <span className="ldr-lbl">Region</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
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
              onChange={(e) => setMinPower(Number(e.target.value))}
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
