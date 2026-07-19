"use client";
// StudyClient — 5 tab rounds, each an array of question cards. Click the card
// to flip and reveal the answer. Local-storage persists which questions the
// user has revealed AND which they've marked missed. "Only missed" filter
// hides everything else.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, RotateCcw, Filter } from "lucide-react";

const LS_REVEALED = "leaders_study_revealed_v1"; // { id: true }
const LS_MISSED = "leaders_study_missed_v1";     // { id: true }

function loadLS(key) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveLS(key, obj) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(obj));
  } catch {}
}

export default function StudyClient({ rounds }) {
  const [tab, setTab] = useState(rounds?.[0]?.round ?? 1);
  const [revealed, setRevealed] = useState({});
  const [missed, setMissed] = useState({});
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setRevealed(loadLS(LS_REVEALED));
    setMissed(loadLS(LS_MISSED));
    setHydrated(true);
  }, []);

  function reveal(id) {
    setRevealed((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: true };
      saveLS(LS_REVEALED, next);
      return next;
    });
  }
  function markGot(id) {
    reveal(id);
    setMissed((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      saveLS(LS_MISSED, next);
      return next;
    });
  }
  function markMissed(id) {
    reveal(id);
    setMissed((prev) => {
      const next = { ...prev, [id]: true };
      saveLS(LS_MISSED, next);
      return next;
    });
  }
  function resetAll() {
    if (typeof window === "undefined") return;
    const ok = window.confirm("Reset all progress across every round?");
    if (!ok) return;
    setRevealed({});
    setMissed({});
    saveLS(LS_REVEALED, {});
    saveLS(LS_MISSED, {});
  }

  const active = useMemo(
    () => rounds.find((r) => r.round === tab) || rounds[0],
    [rounds, tab]
  );

  const list = useMemo(() => {
    if (!active) return [];
    if (!onlyMissed) return active.questions;
    return active.questions.filter((q) => missed[q.id]);
  }, [active, onlyMissed, missed]);

  const missedCount = useMemo(
    () => Object.keys(missed).length,
    [missed]
  );
  const revealedInRound = useMemo(() => {
    if (!active) return 0;
    return active.questions.filter((q) => revealed[q.id]).length;
  }, [active, revealed]);

  return (
    <div className="ldr-root">
      <header className="ldr-top">
        <Link href="/leaders" className="ldr-back">
          <ArrowLeft size={16} /> Atlas
        </Link>
        <div className="ldr-brand">
          <div className="ldr-code">KEYSTONE ATLAS · STUDY MODE</div>
          <div className="ldr-name">5 rounds · 57 leaders</div>
        </div>
        <nav className="ldr-topnav">
          <Link href="/leaders" className="ldr-topnav-item">Overview</Link>
          <Link href="/leaders/study" className="ldr-topnav-item on">Study Mode</Link>
        </nav>
      </header>

      <main className="ldr-study">
        <div className="ldr-round-tabs">
          {rounds.map((r) => (
            <button
              key={r.round}
              className={`ldr-round-tab ${tab === r.round ? "on" : ""}`}
              onClick={() => setTab(r.round)}
            >
              <span className="ldr-round-num">R{r.round}</span>
              <span className="ldr-round-topic">{r.topic}</span>
            </button>
          ))}
        </div>

        <div className="ldr-study-toolbar">
          <div className="ldr-study-stats">
            {hydrated && active ? (
              <>
                <b>{revealedInRound}</b> / {active.questions.length} revealed this round ·{" "}
                <b>{missedCount}</b> total missed
              </>
            ) : (
              <>&nbsp;</>
            )}
          </div>
          <div className="ldr-study-controls">
            <label className="ldr-checkbox">
              <input
                type="checkbox"
                checked={onlyMissed}
                onChange={(e) => setOnlyMissed(e.target.checked)}
              />
              <Filter size={13} /> Only my missed
            </label>
            <button className="ldr-btn ldr-btn-ghost" onClick={resetAll}>
              <RotateCcw size={13} /> Reset progress
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="ldr-empty">
            {onlyMissed
              ? "No missed questions in this round. Nice."
              : "No questions in this round."}
          </div>
        ) : (
          <div className="ldr-cardstack">
            {list.map((qq) => {
              const isOpen = !!revealed[qq.id];
              const isMissed = !!missed[qq.id];
              return (
                <div
                  key={qq.id}
                  className={`ldr-qcard ${isOpen ? "open" : ""} ${isMissed ? "missed" : ""}`}
                >
                  <button
                    className="ldr-qcard-face"
                    onClick={() => reveal(qq.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="ldr-qcard-tag">
                      {qq.country || `Question ${qq.id}`}
                    </span>
                    <span className="ldr-qcard-q">{qq.q}</span>
                    {!isOpen && <span className="ldr-qcard-hint">Click to reveal</span>}
                  </button>
                  {isOpen && (
                    <div className="ldr-qcard-answer">
                      <div className="ldr-qcard-a">{qq.a || "(no answer parsed)"}</div>
                      <div className="ldr-qcard-actions">
                        <button
                          className={`ldr-mark ldr-mark-got ${!isMissed ? "on" : ""}`}
                          onClick={() => markGot(qq.id)}
                        >
                          <Check size={13} /> I got it
                        </button>
                        <button
                          className={`ldr-mark ldr-mark-missed ${isMissed ? "on" : ""}`}
                          onClick={() => markMissed(qq.id)}
                        >
                          <X size={13} /> I missed it
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
