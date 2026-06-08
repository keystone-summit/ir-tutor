"use client";
// /write1001 — Foundations of Academic Writing. Merged from the standalone
// write1001-tutor-app zip into this app as a route. Reuses the portal PIN
// (AuthGate) and the shared /api/tutor proxy; progress is persisted in the
// shared `progress` table, namespaced by a week offset (see WEEK_OFFSET).
import { useState, useEffect } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import { COURSE, WEEKS } from "./data/curriculum";
import Drill from "./components/Drill";
import WritingBox from "./components/WritingBox";
import Tutor from "./components/Tutor";
import AuthGate from "../../components/AuthGate";
import { authFetch, clearToken } from "../../lib/clientAuth";

// Progress for all three courses lives in one `progress` table keyed by
// (user_id, week_number). To avoid a schema change, each course offsets its
// week numbers into its own band: IR 0–14, Write1001 1001–1014, Roots 2001–2014.
const WEEK_OFFSET = 1000;

function Write1001() {
  const [active, setActive] = useState(1);
  const [done, setDone] = useState({}); // local week number -> true

  // Load completed weeks (filtered to this course's band).
  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch("/api/progress");
        const d = await r.json().catch(() => ({}));
        const map = {};
        (d.weeks || []).forEach((n) => {
          if (n > WEEK_OFFSET && n < WEEK_OFFSET + 1000) map[n - WEEK_OFFSET] = true;
        });
        setDone(map);
      } catch { /* leave empty on failure */ }
    })();
  }, []);

  const week = WEEKS.find((w) => w.week === active);
  const doneCount = WEEKS.filter((w) => done[w.week]).length;
  const pct = Math.round((doneCount / WEEKS.length) * 100);

  async function toggleDone(n) {
    const was = !!done[n];
    setDone((d) => ({ ...d, [n]: !was }));
    await authFetch("/api/progress", {
      method: was ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week: n + WEEK_OFFSET }),
    }).catch(() => {});
  }

  function signOut() {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/";
  }

  return (
    <div className="cwrap">
      <div className="layout">
        <aside className="sidebar">
          <a href="/" className="backlink"><ArrowLeft size={14} /> All courses</a>
          <div className="brand">
            <h1>{COURSE.code}</h1>
            <p>{COURSE.title}</p>
          </div>
          <div className="progress">
            <div className="progress-bar"><span style={{ width: `${pct}%` }} /></div>
            <small>{doneCount}/{WEEKS.length} · {pct}% complete</small>
          </div>
          <nav>
            {WEEKS.map((w) => (
              <button
                key={w.week}
                className={`nav-item ${active === w.week ? "current" : ""}`}
                onClick={() => setActive(w.week)}
              >
                <span className="check">{done[w.week] ? "✓" : ""}</span>
                <span className="nav-text">Week {w.week}: {w.title}</span>
              </button>
            ))}
          </nav>
          <button className="sidefoot-out" onClick={signOut}><LogOut size={13} /> Sign out</button>
        </aside>

        <main className="content">
          <p className="unit-tag">{week.unit}</p>
          <h2>Week {week.week}: {week.title}</h2>
          <p className="objective"><strong>Objective:</strong> {week.objective}</p>

          <section className="card">
            <h3>Concepts</h3>
            <ul>{week.concepts.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <p className="reading"><strong>Reading:</strong> {week.reading}</p>
          </section>

          <section className="card">
            <h3>Practice</h3>
            {week.exercises.map((ex, i) =>
              ex.type === "fill" || ex.type === "completion" ? (
                <Drill key={i} ex={ex} />
              ) : (
                <WritingBox key={i} ex={ex} />
              )
            )}
          </section>

          <Tutor weekTitle={week.title} tutorFocus={week.tutorFocus} />

          <button className="complete-btn" onClick={() => toggleDone(week.week)}>
            {done[week.week] ? "✓ Marked complete — undo" : "Mark week complete"}
          </button>
        </main>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Write1001 />
    </AuthGate>
  );
}
