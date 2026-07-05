// Full-lecture voice narration for the IR Tutor course (IAFF / PSC 1001).
//
// One combined MP3 per week (14 in total). Unlike the "brief blurb" theory and
// pattern narrations, this reads the WHOLE module John wrote: the unit intro,
// the lecture blurb, the learning objectives, every key concept with its
// plain-language definition, any strategic (game-theory) model with John's own
// explanation, the assigned-reading titles, and the discussion questions.
//
// CONTENT BOUNDARY (locked by the dispatch): only John's own lecture text is
// voiced. Primary-source EXCERPTS (Thucydides' Melian Dialogue, Machiavelli's
// The Prince, Hobbes' Leviathan, Waltz, Keohane, Fearon, Schelling, etc.) are
// NOT narrated — the readings are spoken as bibliographic references (author +
// title only), never as quoted passages. A short quoted PHRASE inside a blurb
// (a single sub-sentence fragment like "anarchy is what states make of it") is
// John's own lecture prose and is kept; any QUOTED PASSAGE longer than one
// sentence would be skipped, but the course module bodies contain none.
//
// Voice config matches the theory/pattern/briefing narration: ElevenLabs
// "Adam", eleven_multilingual_v2, stability 0.5 / similarity 0.75 / speed 1.0.

export const ADAM_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
export const LECTURE_MODEL_ID = "eleven_multilingual_v2";

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth",
  "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const ROMAN_TO_WORD = { I: "one", II: "two", III: "three", IV: "four", V: "five",
  VI: "six", VII: "seven", VIII: "eight" };

// Normalise text for the TTS engine: spell out "&", expand the few citation
// abbreviations that would otherwise be spelled letter-by-letter ("Ch." ->
// "Chapter", "vs." -> "versus"), and collapse stray whitespace.
function speakable(s) {
  return String(s || "")
    .replace(/&/g, "and")
    .replace(/\bChs\./g, "Chapters")
    .replace(/\bCh\./g, "Chapter")
    .replace(/\bvs\./gi, "versus")
    .replace(/\s+/g, " ")
    .trim();
}

// unit e.g. "III · Game Theory & Methods of Analysis" -> "Unit three, Game
// Theory and Methods of Analysis." The roman-numeral prefix is spoken as a word.
function unitIntro(unit) {
  const raw = String(unit || "").trim();
  const m = raw.split("·").map((x) => x.trim());
  if (m.length >= 2 && ROMAN_TO_WORD[m[0].toUpperCase()]) {
    return `Unit ${ROMAN_TO_WORD[m[0].toUpperCase()]}, ${speakable(m.slice(1).join(" "))}`;
  }
  return speakable(raw);
}

// Split a module title on the "  ·  " separator into the lecture title and any
// trailing assessment markers (Midterm / Problem set / Policy memo due / Crisis
// simulation / Final). The title itself gets its "Game Theory I/II/III" roman
// numerals spoken as words.
function splitTitle(title) {
  const parts = String(title || "").split("·").map((x) => x.trim()).filter(Boolean);
  let main = parts.shift() || "";
  main = main.replace(/\b(I{1,3}|IV|V)\b(?=:)/g, (r) => {
    const w = ROMAN_TO_WORD[r.toUpperCase()];
    return w ? w.charAt(0).toUpperCase() + w.slice(1) : r;
  });
  return { main: speakable(main), markers: parts.map(speakable) };
}

// A spoken sentence describing the week's assessment(s), or "" if none.
function assessmentLine(markers) {
  if (!markers.length) return "";
  const list = markers.join(", and the ");
  return `A note on this week: it also includes the ${list}.`;
}

// Build the full spoken script for one week. Returns a single string with
// paragraph breaks (\n\n) so the TTS engine paces the sections naturally.
export function lectureNarration(week) {
  if (!week) return "";
  const n = week.n;
  const { main, markers } = splitTitle(week.title);
  const parts = [];

  // 1 — Opening: which lecture, and where it sits in the course.
  parts.push(`Week ${n}. ${main}.`);
  const ui = unitIntro(week.unit);
  if (ui) parts.push(`This lecture is part of ${ui}.`);

  // 2 — The lecture blurb (John's own module introduction).
  if (week.blurb) parts.push(speakable(week.blurb));

  // 3 — Learning objectives.
  const objs = (week.objectives || []).map(speakable).filter(Boolean);
  if (objs.length) {
    const seg = ["Here are this week's learning objectives."];
    objs.forEach((o, i) => seg.push(`${(ORDINALS[i] || `Number ${i + 1}`).replace(/^./, (c) => c.toUpperCase())}, ${o}.`));
    parts.push(seg.join(" "));
  }

  // 4 — Key concepts, each with its plain-language definition. Weeks all carry
  // a keyTerms map; fall back to the bare `terms` list if a module lacks one.
  if (week.keyTerms && Object.keys(week.keyTerms).length) {
    const seg = ["Now the key concepts for this week."];
    for (const [term, def] of Object.entries(week.keyTerms)) {
      seg.push(`${speakable(term)}. ${speakable(def)}`);
    }
    parts.push(seg.join(" "));
  } else if ((week.terms || []).length) {
    parts.push("The key terms this week are: " + week.terms.map(speakable).join(", ") + ".");
  }

  // 5 — Strategic (game-theory) models, with John's own explanation of each.
  const games = week.games || [];
  if (games.length) {
    const seg = [games.length > 1
      ? "Let's work through the strategic models for this week."
      : "Let's work through the strategic model for this week."];
    games.forEach((g) => {
      seg.push(`${speakable(g.name)}.`);
      if (g.note) seg.push(speakable(g.note));
    });
    parts.push(seg.join(" "));
  }

  // 6 — Assigned readings, spoken as references (titles/authors only — no
  // primary-source excerpts are read aloud).
  const readings = (week.readings || []).map(speakable).filter(Boolean);
  if (readings.length) {
    const seg = [readings.length > 1
      ? "Your assigned readings this week are the following."
      : "Your assigned reading this week is the following."];
    readings.forEach((r) => seg.push(`${r}.`));
    seg.push("These are references to read on your own; the passages themselves are in the reading list, not in this narration.");
    parts.push(seg.join(" "));
  }

  // 7 — Discussion questions.
  const qs = (week.questions || []).map(speakable).filter(Boolean);
  if (qs.length) {
    const seg = [qs.length > 1
      ? "Finally, some questions to think about as you study."
      : "Finally, a question to think about as you study."];
    qs.forEach((q) => seg.push(q.endsWith("?") ? q : q + "?"));
    parts.push(seg.join(" "));
  }

  // 8 — Assessment note + closing transition.
  const assess = assessmentLine(markers);
  if (assess) parts.push(assess);
  parts.push(`That completes the Week ${n} lecture. When you're ready, open the tutor to be quizzed on these ideas.`);

  return parts.join("\n\n");
}
