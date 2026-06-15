// Shared course constants for the Notes + Chat-Saves features.
//
// The three courses share the `progress` and `chat_messages` tables, keyed by
// an OFFSET week number (IR Tutor 0-14, Write1001 1001-1014, Roots 2001-2014).
// The new `notes` / `chat_saves` tables instead store a `course` tag + the
// LOCAL week number (0-14) so the UI can display "Week 3" directly. When we
// need to read the shared chat_messages table (generate-summary), we map the
// course to its band offset and add it to the local week number.

// 'seminar' is added so the FP Implications Seminar can reuse the existing
// PIN-gated notes table (Option 3) for "Save this seminar / gap / lens" —
// stored with course='seminar' and week_number = the edition's week-key.
// It has no rows in chat_messages, so it never participates in
// generate-summary's offset mapping.
// 'fp_seminar' is the Phase-2 Debate Room / party-card course tag. Unlike
// 'seminar' (which reuses the notes table), fp_seminar saves go to chat_saves
// — full transcript_json for actor cards, persona openings, and debates. It
// has no chat_messages rows, so its offset is never used by generate-summary.
export const COURSES = ["ir_tutor", "write1001", "roots", "seminar", "fp_seminar"];

export const WEEK_OFFSET = {
  ir_tutor: 0,
  write1001: 1000,
  roots: 2000,
  seminar: 3000,
  fp_seminar: 4000,
};

export function isCourse(c) {
  return typeof c === "string" && COURSES.includes(c);
}

// local week (0-14) -> offset week used in chat_messages / progress
export function offsetWeek(course, localWeek) {
  return (WEEK_OFFSET[course] || 0) + localWeek;
}
