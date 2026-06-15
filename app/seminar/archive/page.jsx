"use client";
// /seminar/archive — Phase 1 stub: a simple list of past editions (titles +
// dates). Each links back into /seminar?id=... (the reader supports ?id).
import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Globe } from "lucide-react";
import AuthGate from "../../../components/AuthGate";
import { authFetch } from "../../../lib/clientAuth";

function fmt(d) {
  try { return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
  catch { return d; }
}

function Archive() {
  const [loading, setLoading] = useState(true);
  const [editions, setEditions] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch("/api/seminar/archive");
        const j = await r.json();
        if (j.ok) setEditions(j.editions || []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="sem-wrap">
      <div className="sem-topbar">
        <a href="/seminar" className="sem-back"><ArrowLeft size={15} /> This week</a>
      </div>
      <header className="sem-head">
        <div className="sem-kicker"><Globe size={15} /> Seminar Archive</div>
        <h1>Past Editions</h1>
        <div className="sem-daterange">Searchable archive (by region / actor / lens) arrives in Phase 2.</div>
      </header>

      {loading ? (
        <div className="sem-boot"><Loader2 className="sem-spin" /> Loading…</div>
      ) : editions.length === 0 ? (
        <div className="sem-empty"><p>No past editions yet. The first edition is this week's.</p></div>
      ) : (
        <ul className="sem-archive">
          {editions.map((e) => (
            <li key={e.id}>
              <a href={`/seminar?id=${e.id}`}>
                <span className="sem-arch-date">{fmt(e.week_start_date)} – {fmt(e.week_end_date)}</span>
                <span className="sem-arch-title">{e.title || "Untitled edition"}</span>
                <span className="sem-arch-meta">{e.event_count} events</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Page() {
  return <AuthGate><Archive /></AuthGate>;
}
