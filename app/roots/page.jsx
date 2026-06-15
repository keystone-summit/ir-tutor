"use client";
// /roots — Greek & Latin Roots. Built from scratch to match the WRITE 1001
// pattern. Reuses the portal PIN (AuthGate) and the shared /api/tutor proxy;
// progress is namespaced in the shared `progress` table by a +2000 offset.
import { useState, useEffect } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import { COURSE, WEEKS } from "./data/curriculum";
import RootDrill from "./components/RootDrill";
import Tutor from "./components/Tutor";
import AuthGate from "../../components/AuthGate";
import { authFetch, clearToken } from "../../lib/clientAuth";

const WEEK_OFFSET = 2000; // Roots band in the shared progress table (see write1001 page)

// Clean letter-only variants of a root string ("scrib/script" -> ["scrib","script"]).
function variants(root) {
  return root.split("/").map((s) => s.replace(/[^a-zA-Z]/g, "")).filter(Boolean);
}

// Generate the week's four auto-checked drills from its roots.
function buildDrills(week) {
  const roots = week.roots;
  return [
    {
      type: "match",
      prompt: "Match each root to its meaning.",
      pairs: roots.map((r) => ({ root: r.root, meaning: r.meaning })),
    },
    {
      type: "fill",
      prompt: "Fill in one example word for each root.",
      items: roots.slice(0, 4).map((r) => ({ clue: `${r.root} — “${r.meaning}”`, answers: r.examples })),
    },
    {
      type: "build",
      prompt: "Build a word: type any English word that uses this root.",
      items: roots.slice(0, 3).map((r) => ({ clue: `${r.root} (“${r.meaning}”)`, root: r.root, answers: r.examples })),
    },
    {
      type: "identify",
      prompt: "Identify the root hidden in each word (type just the root).",
      items: roots.slice(0, 4).map((r) => ({ word: r.examples[0], answers: variants(r.root) })),
    },
  ];
}

function Roots() {
  const [active, setActive] = useState(1);
  const [done, setDone] = useState({});

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
  const drills = buildDrills(week);

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
    <div className="cwrap roots">
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
                <span className="nav-text">Week {w.week}: {w.title.split(" — ")[1] || w.title}</span>
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
            <h3>This Week's Roots</h3>
            <div className="rootcards">
              {week.roots.map((r, i) => (
                <div className="rootcard" key={i}>
                  <div className="rootcard-head">
                    <span className="rootcard-root">{r.root}</span>
                    <span className="rootcard-mean">{r.meaning}</span>
                  </div>
                  <div className="rootcard-ex">
                    {r.examples.map((e, k) => <span className="rootchip" key={k}>{e}</span>)}
                  </div>
                </div>
              ))}
            </div>
            {week.note && <p className="reading">{week.note}</p>}
          </section>

          <section className="card">
            <h3>Practice</h3>
            {drills.map((ex, i) => <RootDrill key={`${active}-${ex.type}-${i}`} ex={ex} />)}
          </section>

          <Tutor weekTitle={week.title} tutorFocus={week.tutorFocus} roots={week.roots} week={week.week + WEEK_OFFSET} />

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
      <Roots />
    </AuthGate>
  );
}
