"use client";
// Phase 3.5 — Theory drawer. Slides up from the bottom and shows one IR-theory
// entry with a school-colored header (SCHOOL › sub-school), then the five
// structured fields: definition / classic thinker / canonical example / modern
// echo / related theories (clickable cross-links). Reused by the seminar reader
// (inline theory-tags) and the standalone /seminar/theories library page.
//
// `theory` is a fully-loaded entry (definition, classic_thinker, ...,
// related:[{slug,name,school}]). onNavigate(slug) swaps to a related entry;
// onClose dismisses; onSaved fires after a successful module save.
import React, { useEffect, useState } from "react";
import {
  X, BookMarked, Quote, User2, Landmark, Radio, Link2, BookmarkPlus, Check, Loader2,
} from "lucide-react";
import { authFetch } from "../lib/clientAuth";
import { schoolClass, schoolColor } from "../lib/seminarTheorySchools";

export default function TheoryDrawer({ theory, onClose, onNavigate, onSaved }) {
  const [saveState, setSaveState] = useState("");

  // Close on Escape.
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset the save chip whenever a different theory loads into the drawer.
  useEffect(() => { setSaveState(""); }, [theory && theory.slug]);

  if (!theory) return null;
  const cls = schoolClass(theory.school);
  const accent = schoolColor(theory.school);

  async function save() {
    setSaveState("saving");
    const summary =
      `${theory.name} — IR theory (${theory.school}${theory.sub_school ? " · " + theory.sub_school : ""})\n` +
      `${theory.era || ""}\n\n` +
      `Definition: ${theory.definition || ""}\n\n` +
      (theory.classic_thinker ? `Classic thinker: ${theory.classic_thinker}\n\n` : "") +
      (theory.canonical_example ? `Canonical example: ${theory.canonical_example}\n\n` : "") +
      (theory.modern_echo ? `Modern echo: ${theory.modern_echo}\n\n` : "") +
      ((theory.related || []).length ? `Related: ${(theory.related || []).map((r) => r.name).join(", ")}` : "");
    try {
      const r = await authFetch("/api/chat-saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course: "fp_seminar",
          week_number: 0,
          summary: summary.slice(0, 8000),
          transcript_json: { type: "theory_entry", slug: theory.slug, theory },
          title: `${theory.name} — IR theory`,
        }),
      });
      const j = await r.json();
      setSaveState(j && j.ok ? "saved" : "error");
      if (j && j.ok && onSaved) onSaved();
    } catch { setSaveState("error"); }
  }

  return (
    <div className="thd-overlay" onClick={onClose}>
      <aside
        className={`thd-drawer ${cls}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${theory.name} theory entry`}
        style={{ "--thd-accent": accent }}
      >
        <div className="thd-grip" aria-hidden="true" />
        <div className="thd-head">
          <div className="thd-head-main">
            <div className="thd-school">
              <BookMarked size={12} />
              <span className="thd-school-name">{theory.school}</span>
              {theory.sub_school && <span className="thd-sub">›&nbsp;{theory.sub_school}</span>}
            </div>
            <h3 className="thd-title">{theory.name}</h3>
            {theory.era && <span className="thd-era">{theory.era}</span>}
          </div>
          <button className="thd-x" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="thd-body">
          <div className="thd-field">
            <div className="thd-flabel"><Quote size={13} /> Definition</div>
            <p className="thd-ftext">{theory.definition}</p>
          </div>

          {theory.classic_thinker && (
            <div className="thd-field">
              <div className="thd-flabel"><User2 size={13} /> Classic thinker</div>
              <p className="thd-ftext">{theory.classic_thinker}</p>
            </div>
          )}

          {theory.canonical_example && (
            <div className="thd-field">
              <div className="thd-flabel"><Landmark size={13} /> Canonical example</div>
              <p className="thd-ftext">{theory.canonical_example}</p>
            </div>
          )}

          {theory.modern_echo && (
            <div className="thd-field">
              <div className="thd-flabel"><Radio size={13} /> Modern echo</div>
              <p className="thd-ftext">{theory.modern_echo}</p>
            </div>
          )}

          {(theory.related || []).length > 0 && (
            <div className="thd-field">
              <div className="thd-flabel"><Link2 size={13} /> Related theories</div>
              <div className="thd-related">
                {(theory.related || []).map((r) => (
                  <button
                    key={r.slug}
                    className={`thd-rel ${schoolClass(r.school)}`}
                    style={{ "--thd-accent": schoolColor(r.school) }}
                    onClick={() => onNavigate && onNavigate(r.slug)}
                    title={`Open ${r.name}`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="thd-foot">
            <button
              className="sem-savebtn"
              disabled={saveState === "saving" || saveState === "saved"}
              onClick={save}
              title="Save this theory to my module"
            >
              {saveState === "saved" ? <><Check size={13} /> Saved</>
                : saveState === "saving" ? <><Loader2 size={13} className="sem-spin" /> Saving…</>
                : saveState === "error" ? <>Retry</>
                : <><BookmarkPlus size={13} /> Save to module</>}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
