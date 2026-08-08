// Grading tests for the WRITE 1001 fill-in drills.
// Run: node --import ./scripts/loader-register.mjs scripts/test_write1001_grading.mjs

import { blankIsCorrect, gradeExercise } from "../app/write1001/lib/grade.js";
import { WEEKS } from "../app/write1001/data/curriculum.js";

let pass = 0;
const fails = [];

function t(name, actual, expected) {
  if (actual === expected) pass++;
  else fails.push(`${name}\n     expected ${expected}, got ${actual}`);
}

const week = (n) => WEEKS.find((w) => w.week === n);
const fills = (n) => week(n).exercises.filter((e) => e.type === "fill");

// ---- The reported bug: Week 1, "and i went to ___" ----
const capDrill = fills(1)[0];

t("w1 renders 3 blanks", capDrill.answers.length, 3);
t("w1 first word 'My'", gradeExercise(capDrill, ["My", "I", "."])[0], true);
t("w1 pronoun 'I'", gradeExercise(capDrill, ["My", "I", "."])[1], true);
t("w1 end mark '.'", gradeExercise(capDrill, ["My", "I", "."])[2], true);
t("w1 whole drill correct", gradeExercise(capDrill, ["My", "I", "."]).every(Boolean), true);

// John's exact input: "I." in the pronoun blank. A stray period must not fail it.
t("w1 pronoun accepts 'I.'", gradeExercise(capDrill, ["My", "I.", "."])[1], true);
t("w1 pronoun accepts ' I '", gradeExercise(capDrill, ["My", " I ", "."])[1], true);
t("w1 end mark accepts '!'", gradeExercise(capDrill, ["My", "I", "!"])[2], true);

// ...but the drill still teaches capitalization, so lowercase must fail.
t("w1 rejects lowercase 'my'", gradeExercise(capDrill, ["my", "I", "."])[0], false);
t("w1 rejects lowercase 'i'", gradeExercise(capDrill, ["My", "i", "."])[1], false);
t("w1 rejects empty", gradeExercise(capDrill, ["", "I", "."])[0], false);
t("w1 end mark rejects ','", gradeExercise(capDrill, ["My", "I", ","])[2], false);

// The old answer key leaked authoring placeholders into the accepted list.
const allW1 = JSON.stringify(fills(1).map((e) => e.answers));
t("no 'a name' placeholder in key", allW1.includes("a name"), false);
t("no 'a place' placeholder in key", allW1.includes("a place"), false);

// ---- Week 1 proper-noun drill: student supplies their own name/place ----
const properDrill = fills(1)[1];
t("proper noun 'Maria'", gradeExercise(properDrill, ["Maria", "Paris"])[0], true);
t("proper noun 'Tom'", gradeExercise(properDrill, ["Tom", "School"])[0], true);
t("proper noun 'New York'", gradeExercise(properDrill, ["Ana", "New York"])[1], true);
t("proper noun 'St. Louis'", gradeExercise(properDrill, ["Ana", "St. Louis"])[1], true);
t("proper noun rejects lowercase", gradeExercise(properDrill, ["maria", "Paris"])[0], false);
t("proper noun rejects empty", gradeExercise(properDrill, ["", "Paris"])[0], false);
t("proper noun rejects digits", gradeExercise(properDrill, ["Ana", "Place2"])[1], false);

// ---- Same root cause elsewhere: a stray end mark on a one-word answer ----
t("w5 'went.' accepted", gradeExercise(fills(5)[0], ["went.", "bought."])[0], true);
t("w5 'bought.' accepted", gradeExercise(fills(5)[0], ["went.", "bought."])[1], true);
t("w4 'works.' accepted", gradeExercise(fills(4)[0], ["works.", "are playing"])[0], true);
t("w5 still rejects 'goed'", gradeExercise(fills(5)[0], ["goed", "bought"])[0], false);

// ---- Curly apostrophes from a phone keyboard ----
t("w6 curly '’m going to'", gradeExercise(fills(6)[0], ["will", "’m going to"])[1], true);
t("w6 straight ''m going to'", gradeExercise(fills(6)[0], ["will", "'m going to"])[1], true);

// ---- Widened keys: plainly-correct answers that used to fail ----
t("w2 'fluffy' is an adjective", gradeExercise(fills(2)[0], ["fluffy", "sat", "mat"])[0], true);
t("w2 'naps' is a verb", gradeExercise(fills(2)[0], ["black", "naps", "mat"])[1], true);
t("w2 'sofa' is a noun", gradeExercise(fills(2)[0], ["black", "sat", "sofa"])[2], true);
t("w2 rejects a non-adjective", gradeExercise(fills(2)[0], ["ran", "sat", "mat"])[0], false);
t("w3 'beside the table'", gradeExercise(fills(3)[0], ["but", "beside"])[1], true);
t("w7 'has been living'", gradeExercise(fills(7)[0], ["had eaten", "has been living"])[1], true);
t("w10 'nevertheless'", gradeExercise(fills(10)[0], ["nevertheless"])[0], true);

// ---- Whitespace / casing basics ----
t("collapses inner spaces", blankIsCorrect(["are playing"], "are   playing"), true);
t("default compare is case-insensitive", blankIsCorrect(["went"], "WENT"), true);
t("blank input is never correct", blankIsCorrect(["went"], "   "), false);

// ---- Structural check across the whole course ----
for (const w of WEEKS) {
  for (const [i, ex] of w.exercises.entries()) {
    if (ex.type !== "fill") continue;
    const blanksInText = (ex.text?.match(/___/g) || []).length;
    t(
      `w${w.week} ex${i}: ${blanksInText} blanks in text == ${ex.answers.length} answer slots`,
      blanksInText,
      ex.answers.length
    );
    // Every fill blank must be satisfiable by something.
    t(
      `w${w.week} ex${i}: every blank has an accepted answer`,
      ex.answers.every((a) => ex.acceptAnyCapitalized || a.length > 0),
      true
    );
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  console.error("\nFAILURES:\n  - " + fails.join("\n  - ") + "\n");
  process.exit(1);
}
