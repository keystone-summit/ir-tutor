// /leaders/study — Study/quiz mode. Server component parses the study
// questions from data/leaders_study_questions.md; StudyClient handles the
// reveal + local-storage layer.
import { loadStudyRounds } from "../../../lib/leadersStudy";
import StudyClient from "./StudyClient";

export const dynamic = "force-static";
export const revalidate = 86400;

export const metadata = {
  title: "Study Mode — Keystone Atlas",
  description: "5 rounds of self-test across 57 world leaders. Click to reveal each answer.",
};

export default function LeadersStudyPage() {
  const rounds = loadStudyRounds();
  return <StudyClient rounds={rounds} />;
}
