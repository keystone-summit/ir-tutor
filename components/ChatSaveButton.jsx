"use client";
// Shared "Save chat to module" button + modal. Used by all three courses.
//
// On click: opens a modal, asks the backend to generate a 4-6 bullet AI study
// summary of the current tutor conversation, lets the user edit the summary +
// add a title, preview the full transcript, then saves it to chat_saves.
//
// Props: {
//   course: 'ir_tutor'|'write1001'|'roots',
//   week:   number (local 0-14),
//   messages: [{role, content}, ...]   // current in-memory chat (seed excluded)
//   onSaved?: () => void               // called after a successful save
// }
import React, { useState } from "react";
import { BookmarkPlus, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { authFetch } from "../lib/clientAuth";

export default function ChatSaveButton({ course, week, messages, onSaved, className }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | generating | ready | saving | error
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [title, setTitle] = useState("");
  const [snapshot, setSnapshot] = useState([]); // messages to persist as transcript_json
  const [showTranscript, setShowTranscript] = useState(false);

  const liveMessages = (messages || []).filter((m) => m && m.content && !m.seed)
    .map((m) => ({ role: m.role, content: m.content }));

  async function openModal() {
    setOpen(true);
    setPhase("generating");
    setError("");
    setSummary(""); setTitle(""); setShowTranscript(false);
    try {
      const res = await authFetch("/api/chat-saves/generate-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course, week_number: week }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn’t generate a summary.");
        setPhase("error");
        return;
      }
      setSummary(data.summary || "");
      // Prefer the live in-memory conversation; fall back to what the server read.
      setSnapshot(liveMessages.length ? liveMessages : (data.messages || []));
      setPhase("ready");
    } catch {
      setError("Couldn’t reach the summary service.");
      setPhase("error");
    }
  }

  async function save() {
    if (!summary.trim()) return;
    setPhase("saving");
    try {
      const res = await authFetch("/api/chat-saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course,
          week_number: week,
          summary,
          title: title.trim() || null,
          transcript_json: { messages: snapshot },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setOpen(false);
        setPhase("idle");
        onSaved && onSaved();
      } else {
        setError(data.error || "Save failed.");
        setPhase("ready");
      }
    } catch {
      setError("Save failed.");
      setPhase("ready");
    }
  }

  function close() { if (phase !== "saving") { setOpen(false); setPhase("idle"); } }

  return (
    <>
      <button
        className={className || "cs-trigger"}
        onClick={openModal}
        disabled={liveMessages.length === 0}
        title={liveMessages.length === 0 ? "Start a conversation first" : "Save this chat as a study summary"}
      >
        <BookmarkPlus size={14} /> Save chat to module
      </button>

      {open && (
        <div className="cs-overlay" onClick={close}>
          <div className="cs-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="cs-close" onClick={close} aria-label="Close"><X size={16} /></button>
            <h3>Save chat to module</h3>

            {phase === "generating" && (
              <div className="cs-loading"><Loader2 size={20} className="cs-spin" /> Generating study summary…</div>
            )}

            {phase === "error" && (
              <div className="cs-error">{error}<div className="cs-actions"><button className="cs-btn ghost" onClick={close}>Close</button></div></div>
            )}

            {(phase === "ready" || phase === "saving") && (
              <>
                <label className="cs-field">
                  <span>Title (optional)</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Realism vs. Idealism" maxLength={120} />
                </label>
                <label className="cs-field">
                  <span>Study summary (editable)</span>
                  <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={8} />
                </label>

                <button className="cs-transtoggle" onClick={() => setShowTranscript((v) => !v)}>
                  {showTranscript ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Full transcript ({snapshot.length} messages)
                </button>
                {showTranscript && (
                  <div className="cs-transcript">
                    {snapshot.map((m, i) => (
                      <div key={i} className={`cs-tmsg ${m.role}`}>
                        <b>{m.role === "assistant" ? "Tutor" : "You"}:</b> {m.content}
                      </div>
                    ))}
                  </div>
                )}

                {error && <div className="cs-error">{error}</div>}
                <div className="cs-actions">
                  <button className="cs-btn ghost" onClick={close} disabled={phase === "saving"}>Cancel</button>
                  <button className="cs-btn" onClick={save} disabled={phase === "saving" || !summary.trim()}>
                    {phase === "saving" ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
