"use client";
import { useState, useEffect } from "react";
import { authFetch } from "../../../lib/clientAuth";
import ChatSaveButton from "../../../components/ChatSaveButton";

// Direct-answer AI writing tutor (no Socratic loop). Routes through the shared
// PIN-gated /api/tutor proxy ({system, messages} -> {text}); the writing-tutor
// system prompt (formerly server-side in the zip's /api/tutor) is built here.
// Chat is persisted through the shared /api/chat route, keyed by `week` (the
// caller passes the offset-applied week number so it never collides with the
// IR Tutor or Roots chat bands).
export default function Tutor({ weekTitle, tutorFocus, week, course, localWeek, onSaved }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Load this lesson's saved conversation when the week changes.
  useEffect(() => {
    let cancelled = false;
    if (!Number.isInteger(week)) { setMsgs([]); return; }
    (async () => {
      try {
        const r = await authFetch(`/api/chat?week=${week}`);
        const d = await r.json().catch(() => ({}));
        if (!cancelled) setMsgs((d.messages || []).map((m) => ({ role: m.role, content: m.content })));
      } catch { if (!cancelled) setMsgs([]); }
    })();
    return () => { cancelled = true; };
  }, [week]);

  // Persist one chat turn (fire-and-forget; the UI doesn't wait on it).
  function saveMsg(role, content) {
    if (!Number.isInteger(week)) return;
    authFetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week, role, content }),
    }).catch(() => {});
  }

  function system() {
    return `You are the writing tutor for an introductory academic writing course.
Current lesson: "${weekTitle}".
Teaching focus for this lesson: ${tutorFocus}

STYLE RULES (important):
- Give DIRECT answers. Do NOT use the Socratic method. Do not answer a question with a question.
- When the student is wrong, state the rule plainly, then show the corrected version.
- Fix ONE main thing at a time so a beginner is never overwhelmed.
- Use short sentences and plain language. Always include a tiny concrete example.
- Be encouraging and brief. End with one clear next step when useful.`;
  }

  async function send() {
    if (!input.trim() || loading) return;
    const next = [...msgs, { role: "user", content: input }];
    setMsgs(next);
    setInput("");
    setLoading(true);
    saveMsg("user", input);
    try {
      const r = await authFetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ system: system(), messages: next }),
      });
      const d = await r.json();
      const reply = d.text || "Sorry — please try asking again.";
      setMsgs([...next, { role: "assistant", content: reply }]);
      saveMsg("assistant", reply);
    } catch {
      setMsgs([...next, { role: "assistant", content: "The tutor is unavailable right now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tutor">
      <div className="tutor-head">Writing Tutor — ask anything about this lesson</div>
      <div className="tutor-log">
        {msgs.length === 0 && (
          <p className="tutor-hint">
            Paste a sentence and ask “is this correct?”, or ask a grammar question.
            You’ll get a clear, direct answer.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
        ))}
        {loading && <div className="bubble assistant">…</div>}
      </div>
      {course && Number.isInteger(localWeek) && (
        <div style={{ padding: "8px 16px 0" }}>
          <ChatSaveButton course={course} week={localWeek} messages={msgs} onSaved={onSaved} />
        </div>
      )}
      <div className="tutor-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the tutor…"
        />
        <button onClick={send} className="btn">Send</button>
      </div>
    </div>
  );
}
