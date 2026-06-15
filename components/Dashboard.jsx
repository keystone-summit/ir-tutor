"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  GraduationCap, BookOpen, MessageCircle, Send, Menu, X,
  Sparkles, Target, HelpCircle, Hand, Library, ChevronRight,
  CheckCircle2, Circle, TrendingUp, LogOut
} from "lucide-react";
import { authFetch, clearToken } from "../lib/clientAuth";
import { COURSE, WEEKS, HOME, SUGGESTIONS } from "./course";
import PayoffMatrix from "./PayoffMatrix";
import NotesPanel from "./NotesPanel";
import ChatSaveButton from "./ChatSaveButton";
import StudySaves from "./StudySaves";

export default function Dashboard({ onSignOut }) {
  const [activeN, setActiveN] = useState(0);
  const [tab, setTab] = useState("module");
  const [navOpen, setNavOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState({});
  const [activeTerm, setActiveTerm] = useState(null);
  const [savesRefresh, setSavesRefresh] = useState(0);
  const scrollRef = useRef(null);

  const current = activeN === 0 ? HOME : WEEKS.find((w) => w.n === activeN);
  const doneCount = WEEKS.filter((w) => done[w.n]).length;
  const pct = Math.round((doneCount / WEEKS.length) * 100);

  const welcome = (n) => {
    const where = n === 0 ? "the course as a whole" : `Week ${n}: ${WEEKS.find((w) => w.n === n).title}`;
    return `Welcome \u2014 we're on **${where}**. I'll guide you with questions so the ideas stick, but the moment you'd rather just have the answer, tap **\u201CJust give me the answer.\u201D** Where would you like to start?`;
  };

  // Load this student's completed weeks once
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/progress");
        const data = await res.json().catch(() => ({}));
        const map = {};
        (data.weeks || []).forEach((n) => { map[n] = true; });
        setDone(map);
      } catch { /* leave progress empty on failure */ }
    })();
  }, []);

  // Load saved chat for the current module (fresh seed + any history)
  useEffect(() => {
    let cancelled = false;
    setInput("");
    (async () => {
      const seed = { role: "assistant", seed: true, content: welcome(activeN) };
      let hist = [];
      try {
        const res = await authFetch(`/api/chat?week=${activeN}`);
        const data = await res.json().catch(() => ({}));
        hist = (data.messages || []).map((r) => ({ role: r.role, content: r.content }));
      } catch { /* show just the seed on failure */ }
      if (cancelled) return;
      setMessages(hist.length ? [seed, ...hist] : [seed]);
    })();
    return () => { cancelled = true; };
  }, [activeN]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function buildSystem(mode, history) {
    const topic = activeN === 0
      ? "Course overview and how to study IR well."
      : `Week ${current.n} \u2014 ${current.title} (Unit ${current.unit}). Key concepts: ${current.terms.join(", ")}.`;
    const userTurns = history.filter((m) => m.role === "user").length;
    return (
`You are Professor Atlas, AI tutor for "Introduction to International Relations: Classical Realism, Strategy & Analysis," an intro college course. The course's intellectual spine is CLASSICAL REALISM (Thucydides, Machiavelli, Hobbes, Carr, Morgenthau, Niebuhr), GAME THEORY (payoffs, Nash equilibrium, Prisoner's Dilemma / Stag Hunt / Chicken, the bargaining model of war, deterrence and credibility), and rigorous METHODS OF ANALYSIS (levels of analysis, case studies, counterfactuals, ACH). A few newer theories (neorealism, institutionalism, constructivism) are treated as challengers.

CURRENT MODULE: ${topic}

TEACHING METHOD \u2014 Socratic, with a HARD guarantee against frustration:
1. Lead with ONE short, focused guiding question that nudges the student to reason it out themselves.
2. React to their answer: affirm what is right; probe a gap with at most one more short question.
3. FRUSTRATION GUARD \u2014 stop questioning and give a clear, complete, well-organized DIRECT ANSWER if ANY of these is true: the student seems stuck, confused, or annoyed; you have already gone back and forth ~2 turns on the same point; the student asks for the answer; or their message begins with "/answer". Never trap the student in endless questions.
4. After a direct answer, offer ONE optional check-for-understanding question they may skip.

STYLE: warm and encouraging; plain language first, then the precise term; university-level rigor; short paragraphs. Where useful, reason with realist thinkers and simple game-theory logic (payoffs, equilibrium, credibility). The student has sent ${userTurns} message(s) this session.${mode === "direct" ? " The student wants a DIRECT answer NOW \u2014 skip all questioning and explain clearly and completely." : ""}`
    );
  }

  async function send(text, mode) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setLoading(true);

    // record the student's message (fire-and-forget)
    saveMessage("user", content);

    try {
      const system = buildSystem(mode, next);
      const apiMessages = next.filter((m) => !m.seed).map((m) => ({ role: m.role, content: m.content }));
      const res = await authFetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ system, messages: apiMessages }),
      });
      const data = await res.json();
      const reply = (data && data.text) ? data.text : "\u26A0\uFE0F The tutor didn't respond. Please try again.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      saveMessage("assistant", reply);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "\u26A0\uFE0F I couldn't reach the tutor just now. Please try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  // Persist one chat turn (fire-and-forget; the UI doesn't wait on it).
  function saveMessage(role, content) {
    authFetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week: activeN, role, content }),
    }).catch(() => {});
  }

  async function toggleDone(n) {
    const wasDone = !!done[n];
    setDone((d) => ({ ...d, [n]: !wasDone }));
    await authFetch("/api/progress", {
      method: wasDone ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week: n }),
    }).catch(() => {});
  }

  function signOut() {
    clearToken();
    onSignOut && onSignOut();
  }

  const goToWeek = (n) => { setActiveN(n); setTab("module"); setNavOpen(false); };
  const discussGame = (name) => { setTab("tutor"); send(`Walk me through the ${name} game and what it teaches about international relations.`); };

  const renderText = (t) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : <React.Fragment key={i}>{part}</React.Fragment>
    );

  return (
    <div className="ir-root">
      <header className="ir-top">
        <button className="ir-menu" onClick={() => setNavOpen((v) => !v)} aria-label="Menu">
          {navOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="ir-crest"><GraduationCap size={20} /></div>
        <div className="ir-brand">
          <div className="ir-code">{COURSE.code}</div>
          <div className="ir-name">{COURSE.title}</div>
        </div>
        <div className="ir-sub">{COURSE.subtitle}</div>
        <a className="ir-signout" href="/" title="All courses">
          <Library size={16} />
        </a>
        <button className="ir-signout" onClick={signOut} title="Sign out">
          <LogOut size={16} />
        </button>
      </header>

      <div className="ir-body">
        {navOpen && <div className="ir-overlay" onClick={() => setNavOpen(false)} />}

        <nav className={`ir-side ${navOpen ? "open" : ""}`}>
          <div className="ir-progress">
            <div className="ir-progrow"><TrendingUp size={13} /> <span>Progress</span><b>{doneCount}/{WEEKS.length} · {pct}%</b></div>
            <div className="ir-bar"><div className="ir-barfill" style={{ width: `${pct}%` }} /></div>
          </div>
          <button className={`ir-navitem ${activeN === 0 ? "active" : ""}`} onClick={() => goToWeek(0)}>
            <Library size={16} /> <span>Course Home</span>
          </button>
          <div className="ir-navlabel">Weekly Modules</div>
          {WEEKS.map((w) => (
            <button key={w.n} className={`ir-navitem ${activeN === w.n ? "active" : ""}`} onClick={() => goToWeek(w.n)}>
              <span className="ir-wknum">{w.n}</span>
              <span className="ir-wktitle">{w.title.split("  ·  ")[0]}</span>
              {done[w.n] && <CheckCircle2 size={15} className="ir-wkcheck" />}
            </button>
          ))}
          <div className="ir-sidefoot">14-week semester · 3 credits</div>
        </nav>

        <main className="ir-main">
          <div className="ir-head">
            {activeN > 0 && <div className="ir-unit">{current.unit}</div>}
            <h1>{activeN === 0 ? current.title : `Week ${current.n} · ${current.title.split("  ·  ")[0]}`}</h1>
          </div>

          <div className="ir-tabs">
            <button className={tab === "module" ? "on" : ""} onClick={() => setTab("module")}>
              <BookOpen size={15} /> Module
            </button>
            <button className={tab === "tutor" ? "on" : ""} onClick={() => setTab("tutor")}>
              <MessageCircle size={15} /> Ask the Tutor
            </button>
            <button className={tab === "saves" ? "on" : ""} onClick={() => setTab("saves")}>
              <Library size={15} /> Study Saves
            </button>
          </div>

          {tab === "module" ? (
            <div className="ir-content">
              <p className="ir-blurb">{current.blurb}</p>

              <section className="ir-card">
                <h3><Target size={15} /> Learning Objectives</h3>
                <ul>{current.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
              </section>

              {current.games && <PayoffMatrix games={current.games} onDiscuss={discussGame} />}

              <section className="ir-card">
                <h3><BookOpen size={15} /> Readings</h3>
                <ul className="ir-readings">
                  {current.readings.map((r, i) => {
                    const link = current.readingLinks && current.readingLinks[i];
                    // Reading display text always comes from `r` (the readings array) —
                    // these are full "Book Title — Author, Chapter N" strings.
                    // Direct public link (Internet Archive, JSTOR, Project Gutenberg, etc.)
                    if (link && link.url) {
                      return (
                        <li key={i}>
                          <a className="ir-readlink" href={link.url} target="_blank" rel="noopener">
                            <BookOpen size={13} /> {r}
                          </a>
                          {link.source && <span className="ir-source">{link.source}</span>}
                        </li>
                      );
                    }
                    // No direct link: build Google / Amazon / Library buttons from a real query
                    const q = (link && link.query) || r;
                    const enc = encodeURIComponent(q);
                    return (
                      <li key={i}>
                        <span className="ir-readtext"><BookOpen size={13} /> {r}</span>
                        <span className="ir-readbtns">
                          <a className="ir-scholar"
                            href={`https://www.google.com/search?q=${enc}`}
                            target="_blank" rel="noopener">↗ Google</a>
                          <a className="ir-scholar"
                            href={`https://www.amazon.com/s?k=${enc}`}
                            target="_blank" rel="noopener">↗ Amazon</a>
                          <a className="ir-scholar"
                            href={`https://www.worldcat.org/search?q=${enc}`}
                            target="_blank" rel="noopener">↗ Library</a>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="ir-card">
                <h3><Sparkles size={15} /> Key Concepts</h3>
                {current.keyTerms ? (
                  <>
                    <p className="ir-keyhint">Tap a term for a quick, plain-language definition.</p>
                    <div className="ir-chips">
                      {Object.entries(current.keyTerms).map(([term, def]) => (
                        <button key={term} type="button" className="ir-termchip"
                          onClick={() => setActiveTerm({ term, def })}>
                          {term}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="ir-chips">{current.terms.map((t, i) => <span key={i} className="ir-chip">{t}</span>)}</div>
                )}
              </section>

              <section className="ir-card">
                <h3><HelpCircle size={15} /> Discussion Questions</h3>
                <ul>{current.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </section>

              <div className="ir-actions">
                <button className="ir-cta" onClick={() => setTab("tutor")}>
                  <Sparkles size={15} /> Discuss this with the tutor <ChevronRight size={15} />
                </button>
                {activeN > 0 && (
                  <button className={`ir-complete ${done[activeN] ? "is-done" : ""}`} onClick={() => toggleDone(activeN)}>
                    {done[activeN] ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    {done[activeN] ? "Completed" : "Mark week complete"}
                  </button>
                )}
              </div>

              {activeTerm && (
                <div className="ir-termmodal" onClick={() => setActiveTerm(null)} role="dialog" aria-modal="true">
                  <div className="ir-termcard" onClick={(e) => e.stopPropagation()}>
                    <button className="ir-termclose" onClick={() => setActiveTerm(null)} aria-label="Close">
                      <X size={16} />
                    </button>
                    <div className="ir-termname"><Sparkles size={15} /> {activeTerm.term}</div>
                    <p className="ir-termdef">{activeTerm.def}</p>
                  </div>
                </div>
              )}

              <NotesPanel course="ir_tutor" week={activeN} />
            </div>
          ) : tab === "tutor" ? (
            <div className="ir-chat">
              <div className="ir-msgs" ref={scrollRef}>
                {messages.map((m, i) => (
                  <div key={i} className={`ir-msg ${m.role}`}>
                    {m.role === "assistant" && <div className="ir-avatar"><GraduationCap size={14} /></div>}
                    <div className="ir-bubble">
                      {m.content.split("\n").map((line, j) => <p key={j}>{renderText(line)}</p>)}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="ir-msg assistant">
                    <div className="ir-avatar"><GraduationCap size={14} /></div>
                    <div className="ir-bubble ir-typing"><span></span><span></span><span></span></div>
                  </div>
                )}
              </div>

              <div className="ir-savebar" style={{ padding: "4px 30px 0" }}>
                <ChatSaveButton course="ir_tutor" week={activeN} messages={messages}
                  onSaved={() => setSavesRefresh((n) => n + 1)} />
              </div>

              <div className="ir-suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={loading}>{s}</button>
                ))}
              </div>

              <div className="ir-inputrow">
                <button className="ir-direct" onClick={() => send("/answer Please just give me a clear, direct answer.", "direct")}
                  disabled={loading} title="Skip the questions and get a direct explanation">
                  <Hand size={14} /> Just give me the answer
                </button>
                <div className="ir-entry">
                  <input
                    value={input}
                    placeholder="Type your thoughts or a question…"
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    disabled={loading}
                  />
                  <button className="ir-sendbtn" onClick={() => send()} disabled={loading || !input.trim()}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="ir-content">
              <StudySaves course="ir_tutor" refreshKey={savesRefresh} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
