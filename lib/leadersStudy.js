// lib/leadersStudy.js — Parse data/leaders_study_questions.md into structured
// rounds/questions/answers. Runs server-side; result is passed to the client.
import fs from "node:fs";
import path from "node:path";

let CACHED = null;

// Strip leading "- " and surrounding whitespace; also strip **bold** markdown.
function stripBullet(line) {
  return line.replace(/^\s*-\s+/, "").trim();
}
function stripBold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

// Extract the country name a question is about — the string inside **...**
// (present in every round). Returns null if none found.
function extractCountry(qText) {
  const m = qText.match(/\*\*([^*]+)\*\*/);
  return m ? m[1].trim() : null;
}

// Given an answers block like ["- United States: ...", ...] return a
// map { "united states" (lower) => answer text after the first ": " }.
function parseAnswersBlock(lines) {
  const idx = {};
  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) continue;
    const c = line.indexOf(":");
    if (c === -1) continue;
    const key = line.slice(0, c).trim().toLowerCase();
    const val = line.slice(c + 1).trim();
    idx[key] = val;
  }
  return idx;
}

export function loadStudyRounds() {
  if (CACHED) return CACHED;
  const p = path.join(process.cwd(), "data", "leaders_study_questions.md");
  const raw = fs.readFileSync(p, "utf8");
  const lines = raw.split(/\r?\n/);

  const rounds = [];
  let cur = null;
  let mode = "prose"; // prose | questions | answers
  let answerBuf = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const roundMatch = trimmed.match(/^##\s+Round\s+(\d+)\s*[—-]\s*(.+)$/i);
    if (roundMatch) {
      if (cur) rounds.push(cur);
      cur = {
        round: Number(roundMatch[1]),
        topic: roundMatch[2].trim(),
        questions: [],
        _answers: {},
      };
      mode = "questions";
      answerBuf = [];
      continue;
    }
    if (!cur) continue;

    if (/^<details/i.test(trimmed)) {
      mode = "answers";
      answerBuf = [];
      continue;
    }
    if (/^<\/details>/i.test(trimmed)) {
      cur._answers = parseAnswersBlock(answerBuf);
      mode = "prose";
      continue;
    }

    if (mode === "questions" && /^-\s+/.test(trimmed)) {
      const qText = stripBullet(trimmed);
      const country = extractCountry(qText);
      cur.questions.push({ q: qText, country });
    } else if (mode === "answers" && /^-\s+/.test(trimmed)) {
      answerBuf.push(trimmed);
    }
  }
  if (cur) rounds.push(cur);

  // Attach answer text to each question by country key.
  for (const r of rounds) {
    r.questions = r.questions.map((q, i) => {
      let a = "";
      if (q.country) a = r._answers[q.country.toLowerCase()] || "";
      // stable per-round id used for local-storage tracking
      const id = `r${r.round}q${i + 1}`;
      return { id, q: stripBold(q.q), a, country: q.country };
    });
    delete r._answers;
  }

  CACHED = rounds;
  return rounds;
}
