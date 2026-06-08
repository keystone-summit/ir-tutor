"use client";
import { useState } from "react";

// Auto-checked fill-in / completion drill. Pure client-side, no API.
export default function Drill({ ex }) {
  const blanks = ex.answers?.length || 1;
  const [vals, setVals] = useState(Array(blanks).fill(""));
  const [result, setResult] = useState(null);

  function check() {
    if (ex.type === "completion" || !ex.answers) {
      // Completion has no fixed answer — accept any real attempt, nudge to tutor.
      setResult(vals.map((v) => v.trim().length > 2));
      return;
    }
    setResult(
      ex.answers.map((accepted, i) =>
        accepted.some((a) => a.toLowerCase() === vals[i].trim().toLowerCase())
      )
    );
  }

  return (
    <div className="drill">
      <p className="drill-prompt">{ex.prompt}</p>
      {ex.text && <p className="drill-text">{ex.text}</p>}
      <div className="drill-inputs">
        {Array.from({ length: blanks }).map((_, i) => (
          <input
            key={i}
            value={vals[i]}
            placeholder={`Blank ${i + 1}`}
            onChange={(e) => {
              const next = [...vals];
              next[i] = e.target.value;
              setVals(next);
              setResult(null);
            }}
            className={result ? (result[i] ? "ok" : "bad") : ""}
          />
        ))}
      </div>
      <button onClick={check} className="btn">Check</button>
      {result && (
        <p className="drill-feedback">
          {result.every(Boolean)
            ? "✓ Correct — well done."
            : ex.type === "completion"
            ? "Saved. Paste it to the tutor below for detailed feedback."
            : "Not quite. Fix the highlighted blanks and try again."}
        </p>
      )}
    </div>
  );
}
