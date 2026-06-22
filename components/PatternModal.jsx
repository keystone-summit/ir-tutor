"use client";
// Phase 3b — shared Historical Pattern detail modal.
//
// Used by both the weekly seminar's "Pattern Echoes" section and the
// standalone Library of Patterns page. Renders the full pattern (what
// happened / outcome / lessons / parties / keywords) plus a cross-reference
// of the current seminar editions whose events were matched to it, and a
// "Save pattern to module" button that writes into chat_saves under the
// fp_seminar course (Option 3).
//
// Pass `pattern` (a full row). If `pattern.matched_editions` is undefined the
// modal lazily fetches the cross-reference via /api/seminar/patterns?id=.
import React, { useEffect, useState } from "react";
import {
  X, BookmarkPlus, Check, Loader2, History, Flag, Lightbulb, Users,
  Tag, Link2, ExternalLink, Globe,
} from "lucide-react";
import { authFetch } from "../lib/clientAuth";
import { patternAudioUrl } from "../lib/seminarAudio";
import SeminarAudio from "./SeminarAudio";

function fmtDate(d) {
  try {
    return new Date(String(d).slice(0, 10) + "T00:00:00Z")
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch { return d; }
}

export function patternTypeLabel(t) {
  return String(t || "").replace(/_/g, " ");
}

export default function PatternModal({ pattern, wk = 0, onClose, onSaved }) {
  const [editions, setEditions] = useState(
    Array.isArray(pattern && pattern.matched_editions) ? pattern.matched_editions : null
  );
  const [loadingX, setLoadingX] = useState(false);
  const [saveState, setSaveState] = useState("");

  // Close on Escape.
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose && onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lazily fetch the cross-reference if it wasn't supplied with the pattern.
  useEffect(() => {
    if (editions !== null || !pattern || pattern.id == null) return;
    let on = true;
    setLoadingX(true);
    (async () => {
      try {
        const r = await authFetch(`/api/seminar/patterns?id=${pattern.id}`);
        const j = await r.json();
        if (on && j.ok && j.pattern && Array.isArray(j.pattern.matched_editions)) {
          setEditions(j.pattern.matched_editions);
        } else if (on) setEditions([]);
      } catch { if (on) setEditions([]); }
      finally { if (on) setLoadingX(false); }
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern && pattern.id]);

  if (!pattern) return null;
  const parties = Array.isArray(pattern.parties) ? pattern.parties : [];
  const keywords = Array.isArray(pattern.modern_relevance_keywords) ? pattern.modern_relevance_keywords : [];
  const xref = editions || [];

  async function doSave() {
    setSaveState("saving");
    const summary =
      `${pattern.name} — historical pattern (${patternTypeLabel(pattern.pattern_type)})\n` +
      `${pattern.era || ""}${pattern.date_range ? " · " + pattern.date_range : ""}${pattern.region ? " · " + pattern.region : ""}\n\n` +
      `${pattern.description || ""}\n\n` +
      (pattern.what_happened ? `What happened:\n${pattern.what_happened}\n\n` : "") +
      (pattern.outcome ? `Outcome:\n${pattern.outcome}\n\n` : "") +
      (pattern.lessons ? `Lessons:\n${pattern.lessons}` : "");
    try {
      const r = await authFetch("/api/chat-saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course: "fp_seminar",
          week_number: Number.isInteger(wk) ? wk : 0,
          summary: summary.slice(0, 8000),
          transcript_json: { type: "historical_pattern", pattern_id: pattern.id, pattern },
          title: `${pattern.name} — historical pattern`,
        }),
      });
      const j = await r.json();
      setSaveState(j && j.ok ? "saved" : "error");
      if (j && j.ok && onSaved) onSaved();
    } catch { setSaveState("error"); }
  }

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-card" role="dialog" aria-label={`${pattern.name} — historical pattern`} onClick={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <div className="pm-head-main">
            <span className="pm-type">{patternTypeLabel(pattern.pattern_type)}</span>
            <h3 className="pm-title">{pattern.name}</h3>
            <div className="pm-meta">
              {pattern.era && <span>{pattern.era}</span>}
              {pattern.date_range && <span>· {pattern.date_range}</span>}
              {pattern.region && <span>· {pattern.region}</span>}
            </div>
            <SeminarAudio src={patternAudioUrl(pattern)} label="Listen" />
          </div>
          <button className="pm-x" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="pm-body">
          <p className="pm-lead">{pattern.description}</p>

          {pattern.what_happened && (
            <div className="pm-sec">
              <div className="pm-sec-h"><History size={14} /> What happened</div>
              <p>{pattern.what_happened}</p>
            </div>
          )}
          {pattern.outcome && (
            <div className="pm-sec">
              <div className="pm-sec-h"><Flag size={14} /> Outcome</div>
              <p>{pattern.outcome}</p>
            </div>
          )}
          {pattern.lessons && (
            <div className="pm-sec pm-sec-lesson">
              <div className="pm-sec-h"><Lightbulb size={14} /> Lessons</div>
              <p>{pattern.lessons}</p>
            </div>
          )}

          {parties.length > 0 && (
            <div className="pm-sec">
              <div className="pm-sec-h"><Users size={14} /> Parties</div>
              <div className="pm-chips">{parties.map((p, i) => <span key={i} className="pm-chip">{p}</span>)}</div>
            </div>
          )}
          {keywords.length > 0 && (
            <div className="pm-sec">
              <div className="pm-sec-h"><Tag size={14} /> Modern relevance</div>
              <div className="pm-chips">{keywords.map((k, i) => <span key={i} className="pm-chip kw">{k}</span>)}</div>
            </div>
          )}

          {/* Cross-reference: current editions matched to this pattern */}
          <div className="pm-sec">
            <div className="pm-sec-h"><Link2 size={14} /> Matched in current events</div>
            {loadingX ? (
              <p className="pm-x-empty"><Loader2 size={13} className="sem-spin" /> Checking cross-references…</p>
            ) : xref.length === 0 ? (
              <p className="pm-x-empty">Not yet matched to any published edition.</p>
            ) : (
              <ul className="pm-xref">
                {xref.map((e, i) => (
                  <li key={i}>
                    <a href={`/seminar?id=${e.seminar_id}`} className="pm-xref-link">
                      <span className="pm-xref-date">{fmtDate(e.week_start_date)}</span>
                      <span className="pm-xref-ev">{e.event_title || e.edition_title}</span>
                      {e.match_strength != null && <span className="pm-xref-str">match {e.match_strength}/10</span>}
                      <ExternalLink size={11} />
                    </a>
                    {e.explanation && <p className="pm-xref-expl">{e.explanation}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="pm-foot">
          <button
            className="sem-savebtn pm-save"
            disabled={saveState === "saving" || saveState === "saved"}
            onClick={doSave}
          >
            {saveState === "saved" ? <><Check size={13} /> Saved to module</>
              : saveState === "saving" ? <><Loader2 size={13} className="sem-spin" /> Saving…</>
              : saveState === "error" ? <>Retry save</>
              : <><BookmarkPlus size={13} /> Save pattern to module</>}
          </button>
        </div>
      </div>
    </div>
  );
}
