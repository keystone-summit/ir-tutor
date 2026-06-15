"use client";
// Shared Notes panel — used by all three courses (IR Tutor, Write1001, Roots).
//
// Typed notes auto-save on a 1.5s debounce. Voice notes use the browser's
// Web Speech API (SpeechRecognition / webkitSpeechRecognition) to transcribe
// live and append the text into the textarea — no audio upload, no third-party
// API, works on Chrome (desktop/Android) and iOS Safari. Browsers without the
// API (e.g. Firefox) keep full typed-note functionality; the mic is disabled
// with a hint.
//
// Props: { course: 'ir_tutor'|'write1001'|'roots', week: number (local 0-14) }
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  StickyNote, Mic, Square, Pencil, Trash2, Plus, ChevronDown, ChevronRight, Check,
} from "lucide-react";
import { authFetch } from "../lib/clientAuth";

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

export default function NotesPanel({ course, week }) {
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState("");
  const [activeId, setActiveId] = useState(null);     // id of the note the textarea is bound to (null = new)
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [listExpanded, setListExpanded] = useState(true);

  // voice
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [voiceErr, setVoiceErr] = useState("");
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const baseRef = useRef("");           // textarea content when recording started
  const finalRef = useRef("");          // accumulated final transcript this session

  const debounceRef = useRef(null);
  const lastSavedRef = useRef("");      // last content persisted (to avoid redundant saves)

  const speechSupported = typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Load this week's notes whenever course/week changes; reset the editor.
  useEffect(() => {
    let cancelled = false;
    setContent(""); setActiveId(null); setSavedAt(null); lastSavedRef.current = "";
    (async () => {
      try {
        const res = await authFetch(`/api/notes?course=${encodeURIComponent(course)}&week_number=${week}`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setNotes(data.notes || []);
      } catch { if (!cancelled) setNotes([]); }
    })();
    return () => { cancelled = true; stopVoice(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, week]);

  const persist = useCallback(async (text) => {
    const body = text.trim();
    if (!body || body === lastSavedRef.current) return;
    setSaving(true);
    try {
      if (activeId == null) {
        const res = await authFetch("/api/notes/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ course, week_number: week, content: text }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.ok && data.note) {
          setActiveId(data.note.id);
          lastSavedRef.current = text.trim();
          setSavedAt(data.note.updated_at);
          setNotes((prev) => [data.note, ...prev]);
        }
      } else {
        const res = await authFetch(`/api/notes/${activeId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.ok && data.note) {
          lastSavedRef.current = text.trim();
          setSavedAt(data.note.updated_at);
          setNotes((prev) => prev.map((n) => (n.id === data.note.id ? data.note : n)));
        }
      }
    } catch { /* leave unsaved; next keystroke retries */ }
    finally { setSaving(false); }
  }, [activeId, course, week]);

  // Debounced autosave on content change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!content.trim() || content.trim() === lastSavedRef.current) return;
    debounceRef.current = setTimeout(() => persist(content), 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [content, persist]);

  function newNote() {
    // flush any pending edit first
    if (content.trim() && content.trim() !== lastSavedRef.current) persist(content);
    setContent(""); setActiveId(null); setSavedAt(null); lastSavedRef.current = "";
  }

  function editNote(n) {
    if (content.trim() && content.trim() !== lastSavedRef.current) persist(content);
    setContent(n.content); setActiveId(n.id); setSavedAt(n.updated_at);
    lastSavedRef.current = n.content.trim();
  }

  async function delNote(n) {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    try {
      const res = await authFetch(`/api/notes/${n.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setNotes((prev) => prev.filter((x) => x.id !== n.id));
        if (activeId === n.id) newNote();
      }
    } catch { /* ignore */ }
  }

  // ---- Voice (Web Speech API) ----
  function startVoice() {
    if (!speechSupported || listening) return;
    setVoiceErr("");
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    baseRef.current = content ? content.replace(/\s*$/, "") + (content.trim() ? " " : "") : "";
    finalRef.current = "";

    rec.onresult = (ev) => {
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const seg = ev.results[i];
        if (seg.isFinal) finalRef.current += seg[0].transcript;
        else interimText += seg[0].transcript;
      }
      setInterim(interimText);
      setContent(baseRef.current + finalRef.current + interimText);
    };
    rec.onerror = (ev) => {
      if (ev && ev.error === "not-allowed") setVoiceErr("Microphone permission denied.");
      else if (ev && ev.error && ev.error !== "no-speech" && ev.error !== "aborted") setVoiceErr("Voice error: " + ev.error);
      stopVoice();
    };
    rec.onend = () => {
      // commit final text (drop trailing interim) and stop the clock
      setContent(baseRef.current + finalRef.current);
      setInterim("");
      setListening(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      recRef.current = null;
    };

    recRef.current = rec;
    try { rec.start(); } catch { /* already started */ }
    setListening(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }

  function stopVoice() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* noop */ } }
    setListening(false);
    setInterim("");
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <section className="ns-panel">
      <div className="ns-head">
        <StickyNote size={15} />
        <span>Notes</span>
        {notes.length > 0 && (
          <button className="ns-toggle" onClick={() => setListExpanded((v) => !v)} aria-label="Toggle prior notes">
            {listExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {notes.length} saved
          </button>
        )}
      </div>

      {notes.length > 0 && listExpanded && (
        <ul className="ns-list">
          {notes.map((n) => (
            <li key={n.id} className={`ns-item ${activeId === n.id ? "active" : ""}`}>
              <button className="ns-item-body" onClick={() => editNote(n)} title="Edit this note">
                <span className="ns-item-text">{n.content}</span>
                <span className="ns-item-time">{fmtTime(n.updated_at)}</span>
              </button>
              <span className="ns-item-actions">
                <button onClick={() => editNote(n)} title="Edit" className="ns-iconbtn"><Pencil size={14} /></button>
                <button onClick={() => delNote(n)} title="Delete" className="ns-iconbtn danger"><Trash2 size={14} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="ns-editor">
        <div className="ns-editor-bar">
          <span className="ns-editor-label">{activeId == null ? "New note" : "Editing note"}</span>
          {activeId != null && (
            <button className="ns-newbtn" onClick={newNote}><Plus size={13} /> New note</button>
          )}
        </div>
        <textarea
          className="ns-textarea"
          value={content}
          placeholder="Type your notes here, or tap the mic to dictate…"
          onChange={(e) => setContent(e.target.value)}
        />
        {listening && (
          <div className="ns-recbar">
            <span className="ns-recdot" /> Recording <b>{mmss}</b>
            {interim && <span className="ns-interim">“{interim}”</span>}
          </div>
        )}
        <div className="ns-actions">
          {speechSupported ? (
            listening ? (
              <button className="ns-micbtn rec" onClick={stopVoice}><Square size={14} /> Stop</button>
            ) : (
              <button className="ns-micbtn" onClick={startVoice}><Mic size={14} /> Dictate</button>
            )
          ) : (
            <span className="ns-novoice"><Mic size={13} /> Voice input isn’t supported in this browser</span>
          )}
          <span className="ns-saved">
            {saving ? "Saving…" : savedAt ? <><Check size={13} /> Saved {fmtTime(savedAt)}</> : ""}
          </span>
        </div>
        {voiceErr && <div className="ns-voiceerr">{voiceErr}</div>}
      </div>
    </section>
  );
}
