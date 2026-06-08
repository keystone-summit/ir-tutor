"use client";
import { useState } from "react";
import { authFetch } from "../../../lib/clientAuth";

// Draft-and-feedback box. The student writes; the AI tutor returns direct
// WHAT WORKS / MAIN FIX / TRY NEXT feedback.
//
// DECISION: instead of the zip's separate /api/feedback route (which carried
// its own Anthropic key), this builds the feedback system prompt client-side
// and routes through the EXISTING shared, PIN-gated /api/tutor proxy via
// authFetch. One Anthropic-key surface, one auth gate.
export default function WritingBox({ ex }) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const min = ex.minWords || 0;

  function feedbackSystem() {
    return `You are a writing tutor giving feedback on a student's submission for an intro academic writing course.

The exercise prompt was: "${ex.prompt}"${ex.targetTense ? `\nThe target tense/form was: ${ex.targetTense}` : ""}

Respond as plain text in exactly this shape:
WHAT WORKS: (one short line of genuine praise)
MAIN FIX: (the single most important correction, with the corrected version shown)
TRY NEXT: (one concrete suggestion to push the writing further)

Rules: Be direct and kind. Fix ONE main thing — do not list every error. Use plain language and short sentences. Always show the corrected example, never just describe it.`;
  }

  async function submit() {
    setLoading(true);
    setFeedback("");
    try {
      const r = await authFetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system: feedbackSystem(),
          messages: [{ role: "user", content: text }],
        }),
      });
      const d = await r.json();
      setFeedback(d.text || "Could not generate feedback. Try again.");
    } catch {
      setFeedback("Feedback service unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="writing-box">
      <p className="drill-prompt">{ex.prompt}</p>
      {ex.text && (
        <p className="rewrite-source">Rewrite this:<br /><em>{ex.text}</em></p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your response here…"
        rows={6}
      />
      <div className="writing-bar">
        <span className={words >= min ? "wc ok" : "wc"}>
          {words} words{min ? ` / ${min} min` : ""}
        </span>
        <button onClick={submit} disabled={loading || words < Math.max(min, 5)} className="btn">
          {loading ? "Reviewing…" : "Get feedback"}
        </button>
      </div>
      {feedback && <pre className="feedback">{feedback}</pre>}
    </div>
  );
}
