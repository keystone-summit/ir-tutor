"use client";
// Shared "Study Saves" view — lists saved tutor chats for a course, grouped by
// week. Each card shows title/summary preview; clicking opens the full summary
// with an editable title/summary and an expandable transcript. Used by all
// three courses.
//
// Props: {
//   course: 'ir_tutor'|'write1001'|'roots',
//   refreshKey?: any   // change this to force a reload (e.g. after a new save)
//   weekLabel?: (n) => string   // optional: render a week number as a label
// }
import React, { useState, useEffect, useCallback } from "react";
import {
  Bookmark, ChevronDown, ChevronRight, Pencil, Trash2, X, Check, MessageSquare,
} from "lucide-react";
import { authFetch } from "../lib/clientAuth";

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
}
function firstBullets(text, n) {
  return (text || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, n);
}

export default function StudySaves({ course, refreshKey, weekLabel }) {
  const [saves, setSaves] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [showTranscriptId, setShowTranscriptId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/chat-saves?course=${encodeURIComponent(course)}`);
      const data = await res.json().catch(() => ({}));
      setSaves(data.saves || []);
    } catch { setSaves([]); }
    finally { setLoaded(true); }
  }, [course]);

  useEffect(() => { load(); }, [load, refreshKey]);

  function startEdit(s) {
    setEditingId(s.id); setEditTitle(s.title || ""); setEditSummary(s.summary || "");
  }
  async function saveEdit(s) {
    try {
      const res = await authFetch(`/api/chat-saves/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() || null, summary: editSummary }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.save) {
        setSaves((prev) => prev.map((x) => (x.id === s.id ? data.save : x)));
        setEditingId(null);
      }
    } catch { /* ignore */ }
  }
  async function del(s) {
    if (!confirm("Delete this saved chat? This cannot be undone.")) return;
    try {
      const res = await authFetch(`/api/chat-saves/${s.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setSaves((prev) => prev.filter((x) => x.id !== s.id));
        if (openId === s.id) setOpenId(null);
      }
    } catch { /* ignore */ }
  }

  // group by week_number (ascending)
  const byWeek = {};
  saves.forEach((s) => { (byWeek[s.week_number] = byWeek[s.week_number] || []).push(s); });
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
  const wkLabel = weekLabel || ((n) => (n === 0 ? "Course Home" : `Week ${n}`));

  return (
    <section className="ss-wrap">
      <div className="ss-head"><Bookmark size={16} /> Study Saves</div>
      {!loaded ? (
        <p className="ss-empty">Loading…</p>
      ) : saves.length === 0 ? (
        <p className="ss-empty">No saved chats yet. In the tutor, tap <b>“Save chat to module”</b> to keep an AI study summary here.</p>
      ) : (
        weeks.map((wk) => (
          <div key={wk} className="ss-weekgroup">
            <div className="ss-weeklabel">{wkLabel(wk)}</div>
            {byWeek[wk].map((s) => {
              const isOpen = openId === s.id;
              const isEditing = editingId === s.id;
              const heading = s.title || (s.summary || "").replace(/^[-•\s]+/, "").slice(0, 60) || "Saved chat";
              const tx = (s.transcript_json && s.transcript_json.messages) || [];
              return (
                <div key={s.id} className={`ss-card ${isOpen ? "open" : ""}`}>
                  <button className="ss-cardhead" onClick={() => setOpenId(isOpen ? null : s.id)}>
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span className="ss-title">{heading}</span>
                    <span className="ss-date">{fmtDate(s.created_at)}</span>
                  </button>

                  {!isOpen && (
                    <ul className="ss-preview">
                      {firstBullets(s.summary, 3).map((b, i) => <li key={i}>{b.replace(/^[-•]\s*/, "")}</li>)}
                    </ul>
                  )}

                  {isOpen && (
                    <div className="ss-detail">
                      {isEditing ? (
                        <>
                          <input className="ss-editinput" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title (optional)" maxLength={120} />
                          <textarea className="ss-editarea" value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={8} />
                          <div className="ss-detailactions">
                            <button className="ss-btn ghost" onClick={() => setEditingId(null)}>Cancel</button>
                            <button className="ss-btn" onClick={() => saveEdit(s)}><Check size={14} /> Save</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="ss-summary">
                            {(s.summary || "").split("\n").map((l, i) => l.trim() ? <p key={i}>{l.replace(/^[-•]\s*/, "• ")}</p> : null)}
                          </div>
                          <button className="ss-transtoggle" onClick={() => setShowTranscriptId(showTranscriptId === s.id ? null : s.id)}>
                            <MessageSquare size={13} /> {showTranscriptId === s.id ? "Hide" : "Show"} transcript ({tx.length})
                          </button>
                          {showTranscriptId === s.id && (
                            <div className="ss-transcript">
                              {tx.map((m, i) => (
                                <div key={i} className={`ss-tmsg ${m.role}`}><b>{m.role === "assistant" ? "Tutor" : "You"}:</b> {m.content}</div>
                              ))}
                            </div>
                          )}
                          <div className="ss-detailactions">
                            <button className="ss-iconbtn" onClick={() => startEdit(s)} title="Edit"><Pencil size={14} /> Edit</button>
                            <button className="ss-iconbtn danger" onClick={() => del(s)} title="Delete"><Trash2 size={14} /> Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
