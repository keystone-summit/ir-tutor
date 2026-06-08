"use client";
import { useState } from "react";

// Auto-checked drills for ROOTS 1001. One component handles all four drill
// types the curriculum spec calls for: matching, fill-in-the-blank,
// build-a-word, and identify-the-root. Pure client-side, no API.
//
// Exercise shapes (generated from the week's roots in page.jsx):
//   match:    { type:"match", prompt, pairs:[{root,meaning}] }
//   fill:     { type:"fill", prompt, items:[{clue, answers:[word,...]}] }
//   build:    { type:"build", prompt, items:[{clue, root, answers:[word,...]}] }
//   identify: { type:"identify", prompt, items:[{word, answers:[rootVariant,...]}] }

// Pull clean letter-only variants out of a root string like "scrib/script"
// or "a-/an-" -> ["scrib","script"] / ["a","an"].
function variants(root) {
  return root.split("/").map((s) => s.replace(/[^a-zA-Z]/g, "").toLowerCase()).filter(Boolean);
}

function eq(a, b) {
  return a.trim().toLowerCase() === String(b).trim().toLowerCase();
}

export default function RootDrill({ ex }) {
  if (ex.type === "match") return <MatchDrill ex={ex} />;
  return <InputDrill ex={ex} />;
}

// ---- Matching: pick the meaning for each root from a dropdown ----
function MatchDrill({ ex }) {
  const meanings = ex.pairs.map((p) => p.meaning);
  // Shuffle the option order once so the dropdowns aren't pre-aligned.
  const [shuffled] = useState(() => {
    const arr = [...meanings];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });
  const [picks, setPicks] = useState(Array(ex.pairs.length).fill(""));
  const [result, setResult] = useState(null);

  function check() {
    setResult(ex.pairs.map((p, i) => eq(picks[i], p.meaning)));
  }

  return (
    <div className="drill">
      <p className="drill-prompt">{ex.prompt}</p>
      <div className="rootmatch">
        {ex.pairs.map((p, i) => (
          <div className="rootmatch-row" key={i}>
            <span className="rootmatch-root">{p.root}</span>
            <select
              value={picks[i]}
              className={result ? (result[i] ? "ok" : "bad") : ""}
              onChange={(e) => {
                const next = [...picks];
                next[i] = e.target.value;
                setPicks(next);
                setResult(null);
              }}
            >
              <option value="">— choose meaning —</option>
              {shuffled.map((m, k) => (
                <option key={k} value={m}>{m}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button onClick={check} className="btn">Check</button>
      {result && (
        <p className="drill-feedback">
          {result.every(Boolean)
            ? "✓ All matched correctly — well done."
            : "Some are off. Fix the highlighted rows and try again."}
        </p>
      )}
    </div>
  );
}

// ---- Fill / build / identify: one text input per item ----
function InputDrill({ ex }) {
  const items = ex.items;
  const [vals, setVals] = useState(Array(items.length).fill(""));
  const [result, setResult] = useState(null);

  // letters only, so "-logy" matches "logy" and "auto-" matches "auto".
  const norm = (s) => String(s).trim().toLowerCase().replace(/[^a-z]/g, "");

  function checkOne(item, typed) {
    const tn = norm(typed);
    if (!tn) return false;
    if (ex.type === "build") {
      // Accept a known example OR any real word containing the root (len ≥ 3).
      if (item.answers.some((a) => norm(a) === tn)) return true;
      return variants(item.root).some((v) => v.length >= 3 && tn.includes(v));
    }
    // fill + identify: must match one of the accepted answers.
    return item.answers.some((a) => norm(a) === tn);
  }

  function check() {
    setResult(items.map((item, i) => checkOne(item, vals[i])));
  }

  return (
    <div className="drill">
      <p className="drill-prompt">{ex.prompt}</p>
      <div className="rootinputs">
        {items.map((item, i) => (
          <div className="rootinput-row" key={i}>
            <span className="rootinput-clue">
              {ex.type === "identify" ? <strong>{item.word}</strong> : item.clue}
            </span>
            <input
              value={vals[i]}
              placeholder={ex.type === "identify" ? "root" : "word"}
              className={result ? (result[i] ? "ok" : "bad") : ""}
              onChange={(e) => {
                const next = [...vals];
                next[i] = e.target.value;
                setVals(next);
                setResult(null);
              }}
            />
          </div>
        ))}
      </div>
      <button onClick={check} className="btn">Check</button>
      {result && (
        <p className="drill-feedback">
          {result.every(Boolean)
            ? "✓ Correct — well done."
            : "Not quite. Fix the highlighted answers, or ask the tutor below."}
        </p>
      )}
    </div>
  );
}
