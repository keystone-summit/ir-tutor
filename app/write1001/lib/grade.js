// Answer checking for WRITE 1001 fill-in drills.
//
// Lives outside the component so it can be unit-tested
// (scripts/test_write1001_grading.mjs).
//
// Rule of thumb: never mark a student wrong for something the exercise isn't
// teaching. Stray spacing, a phone keyboard's curly apostrophe, and a trailing
// period on a one-word answer are all noise. Capitalization is noise too —
// EXCEPT in the Week 1 capitalization drill, where it is the whole point, so
// those exercises set `caseSensitive: true`.

const END_MARKS = ".!?";

function normalize(s) {
  return String(s ?? "")
    .replace(/[‘’ʼ]/g, "'") // curly apostrophe -> straight
    .replace(/[“”]/g, '"') // curly quotes -> straight
    .replace(/\s+/g, " ")
    .trim();
}

// Drop a trailing end mark the answer key never asked for, so "I." passes a
// blank whose answer is "I". A blank whose answer IS an end mark keeps it.
function stripStrayEnd(input, accepted) {
  if (accepted && END_MARKS.includes(accepted.slice(-1))) return input;
  return input.replace(/[.!?]+$/, "").trim();
}

// Blanks the student fills with their own proper noun (a friend's name, a
// place they went). There is no answer key for those — the rule being drilled
// is "proper nouns start with a capital letter", so that is what we check.
const PROPER_NOUN = /^\p{Lu}[\p{L}\p{M}'.\- ]*$/u;

export function blankIsCorrect(
  accepted,
  raw,
  { caseSensitive = false, acceptAnyCapitalized = false } = {}
) {
  const input = normalize(raw);
  if (!input) return false;
  if (acceptAnyCapitalized) return PROPER_NOUN.test(input);
  return (accepted || []).some((a) => {
    const want = normalize(a);
    const got = stripStrayEnd(input, want);
    return caseSensitive ? got === want : got.toLowerCase() === want.toLowerCase();
  });
}

export function gradeExercise(ex, vals) {
  // Completion has no fixed answer — accept any real attempt, nudge to tutor.
  if (ex.type === "completion" || !ex.answers) {
    return vals.map((v) => normalize(v).length > 2);
  }
  return ex.answers.map((accepted, i) =>
    blankIsCorrect(accepted, vals[i], {
      caseSensitive: !!ex.caseSensitive,
      acceptAnyCapitalized: !!ex.acceptAnyCapitalized,
    })
  );
}
