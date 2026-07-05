# IR Tutor — Full-Lecture Voice-Over Complete

**Date:** 2026-07-04
**Repo:** `keystone-summit/ir-tutor` (`ir-tutor-keystone/`)
**Live:** https://ir-tutor.vercel.app/irtutor
**Voice:** ElevenLabs "Adam" (`pNInz6obpgDQGcFmaJgB`), model `eleven_multilingual_v2`, stability 0.5 / similarity 0.75 / speed 1.0 — identical to the existing theory/pattern/briefing narration.

## What changed

Previously only **brief blurbs** were voiced (the 73 IR-theory and 54 historical-pattern one-paragraph entries in the FP Seminar libraries). The 14-week **IR Tutor course** (`/irtutor`, `components/course.js`) had **no** audio at all.

Now every one of the 14 weekly lectures has a **full narration** — the whole module John wrote: unit intro → lecture blurb → learning objectives → every key concept with its plain-language definition → the game-theory models with John's own explanation → assigned-reading references → discussion questions → closing transition. A **"Listen to the full lecture"** button now sits under each week's blurb in the Module tab.

## Deliverables

- **14 MP3s** in `public/audio/seminar/lecture_1.mp3` … `lecture_14.mp3` (git-tracked static files, served by Next.js — same pattern as the 127 existing theory/pattern MP3s; no DB row/migration needed).
- **`lib/seminarLectureVoice.js`** (new) — pure `lectureNarration(week)` builder + voice constants.
- **`scripts/generate_seminar_audio.mjs`** (extended) — new `lectures` mode (`node scripts/generate_seminar_audio.mjs lectures [week#]`), plus `FORCE=1` to regenerate. Default (no args) still builds all three sets; idempotent (skips existing).
- **`lib/seminarAudio.js`** — new `lectureAudioUrl(week)` helper (`/audio/seminar/lecture_<n>.mp3`).
- **`components/Dashboard.jsx`** + **`app/globals.css`** — the `SeminarAudio` player wired into the Module tab for weeks 1–14.

## Per-lecture inventory

| # | Lecture | Duration |
|---|---------|----------|
| 1 | What Is IR? Levels of Analysis | 2:43 |
| 2 | Anarchy, the State & the Balance of Power | 2:21 |
| 3 | Thucydides: The Birth of Realism | 2:24 |
| 4 | Machiavelli: Statecraft, Virtù & Necessity | 2:07 |
| 5 | Hobbes: Anarchy & the State of Nature | 2:10 |
| 6 | Carr, Morgenthau & Niebuhr | 2:23 |
| 7 | Game Theory I: Strategic Interaction (+ Midterm) | 2:42 |
| 8 | Game Theory II: The Core Games | 3:00 |
| 9 | Game Theory III: Bargaining & Deterrence (+ Problem set) | 2:42 |
| 10 | Methods of Analysis (+ Policy memo due) | 2:22 |
| 11 | Neorealism & the Structural Turn | 2:19 |
| 12 | Institutions & Ideas (+ Crisis simulation) | 2:30 |
| 13 | Applying the Toolkit: Great-Power Competition | 2:22 |
| 14 | Statecraft, Practice & Synthesis (+ Final) | 2:09 |

**Total playback: 34 min 22 sec** (2,062.6 s) across 14 lectures. ~32 MB total. Average 2:27 / lecture.

## Content boundary — copyrighted excerpts

**No primary-source excerpts were narrated.** The task boundary requires that Thucydides' Melian Dialogue, Machiavelli's *The Prince*, Hobbes' *Leviathan*, Waltz, Keohane, Fearon, Schelling, etc. stay as **reading references only**, never voiced.

Verified programmatically: the course module bodies contain **no multi-sentence quoted passages** from any primary source. Every quoted string in the narrated text is one of:
- a **citation title** in quotes (e.g. "Cooperation Under the Security Dilemma", "Anarchy Is What States Make of It") — bibliographic, spoken as a reference, and
- a **single sub-sentence famous phrase** inside John's own explanatory prose — e.g. "the strong do what they can and the weak suffer what they must" (Wk 3, one clause), "not to be good" (Wk 4), "war of all against all" (Wk 5), "interest defined as power" (Wk 6), "anarchy is what states make of it" (Wk 12).

None exceeds one sentence, so **nothing had to be skipped**. The actual excerpts (Melian Dialogue text, Prince chapters, Leviathan ch. 13, Fearon's paper, etc.) never appear in the module bodies — they live only in each week's Readings list, which the app links out to (MIT Classics, Project Gutenberg, JSTOR, Internet Archive, Stanford, CIA.gov). The narration explicitly tells the listener the passages "are in the reading list, not in this narration."

**Skipped quotes per lecture: none (0 across all 14).**

## Cost & balance

- The account's API key lacks the `user_read` permission, so `GET /v1/user` / `/v1/user/subscription` return `missing_permissions` — the dollar balance could not be read via the API. (This same key successfully generated the 127 existing theory/pattern MP3s, and a live TTS call fails loudly on an exhausted quota, so the generation itself is the balance guard.)
- **Characters consumed this run: 28,548** (lecture 1 test = 2,301; lectures 2–14 batch = 26,247). 0 failures.
- At standard ElevenLabs TTS pricing this is a small fraction of a monthly Creator/Pro character quota (~28.5k of 100k+).

## Verification

- Production build (`next build`) compiles clean — `/irtutor` route includes the new player.
- Local prod server: `GET /audio/seminar/lecture_1.mp3` → `200 OK, Content-Type: audio/mpeg, 2,621,066 bytes`. The `SeminarAudio` component requests exactly this URL.
- All 14 files validate as real MP3s (ffprobe reports correct durations).
