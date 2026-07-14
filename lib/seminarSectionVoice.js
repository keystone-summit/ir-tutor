// Server-side helpers for whole-page, per-section seminar narration.
//
// Extends the existing per-edition Weekly Briefing voice (lib/seminarBriefingVoice.js)
// to EVERY readable section of the Foreign Policy reader: Weekly Briefing, Deep
// Dive (five layers + five lenses), Gaps to Fill, Implications, What to Watch,
// and Pattern Echoes. Each section is synthesised on demand with the same voice
// (ElevenLabs "Adam", eleven_multilingual_v2) and cached in Postgres keyed by a
// CONTENT HASH, so a section regenerates only when its text actually changes.
//
// Text builders are PURE (they take the loaded DB bundle as arguments and touch
// no database), which keeps them unit-testable without a connection. The table
// + synthesis helpers take the `query` / fetch surfaces they need.

import crypto from "node:crypto";
import { SECTION_BY_KEY, SECTION_KEYS } from "./seminarSections";
import {
  synthesizeBriefing,
  briefingNarration,
  ADAM_VOICE_ID,
  BRIEFING_MODEL_ID,
} from "./seminarBriefingVoice";

export { ADAM_VOICE_ID, BRIEFING_MODEL_ID, SECTION_KEYS };

// ElevenLabs accepts large inputs, but we keep each request comfortably bounded
// so a long Deep Dive doesn't approach any per-request ceiling and each chunk
// synthesises quickly. Chunks are joined on paragraph, then sentence, then hard
// boundaries and the resulting MP3 buffers are concatenated.
const MAX_CHARS_PER_REQUEST = 3500;

// Spoken-form normaliser: expand "&", spell "US"/"U.S." as "United States", turn
// the OSINT acronym into words, and collapse whitespace so the engine paces well.
function speakable(s) {
  return String(s || "")
    .replace(/&/g, " and ")
    .replace(/\bU\.S\.\b/g, "United States")
    .replace(/\bU\.S\b/g, "United States")
    .replace(/\bUS\b/g, "United States")
    .replace(/\s+/g, " ")
    .trim();
}

const LAYER_SPOKEN = [
  ["world_order", "Layer one, world order"],
  ["regional", "Layer two, regional"],
  ["bilateral", "Layer three, bilateral"],
  ["domestic", "Layer four, domestic"],
  ["actor", "Layer five, actor"],
];

const LENS_SPOKEN = [
  ["realism", "Realism"],
  ["liberalism", "Liberalism"],
  ["constructivism", "Constructivism"],
  ["marxist", "Marxist and world-systems"],
  ["game_theory", "Game theory"],
];

const GAP_SPOKEN = [
  ["info", "Information gaps"],
  ["source_bias", "Source-bias gaps"],
  ["counterfactual", "Counterfactuals"],
  ["osint", "Open-source intelligence gaps"],
  ["counter_intel", "Counter-intelligence red flags"],
];

const IMP_SPOKEN = [
  ["us_strategy", "United States strategy"],
  ["us_business", "United States business"],
  ["us_households", "United States households"],
];

function deepDiveNarration(bundle) {
  const dd = bundle.deep_dive || {};
  const layers = dd.layers || {};
  const lenses = dd.lenses || {};
  const lead = (bundle.events || []).find((e) => e.rank === 1) || (bundle.events || [])[0];
  const parts = [];
  parts.push(lead ? `Deep dive on ${speakable(lead.title)}.` : "Deep dive on this week's lead event.");

  const layerSegs = [];
  LAYER_SPOKEN.forEach(([k, lbl]) => {
    const t = String(layers[k] || "").trim();
    if (t) layerSegs.push(`${lbl}. ${speakable(t)}`);
  });
  if (layerSegs.length) {
    parts.push("First, the five-layer drill-down.");
    layerSegs.forEach((s) => parts.push(s));
  }

  const lensSegs = [];
  LENS_SPOKEN.forEach(([k, lbl]) => {
    const t = String(lenses[k] || "").trim();
    if (t) lensSegs.push(`${lbl}. ${speakable(t)}`);
  });
  if (lensSegs.length) {
    parts.push("Now the five-lens analysis.");
    lensSegs.forEach((s) => parts.push(s));
  }
  return parts.join("\n\n");
}

function labelledMapNarration(bundle, mapKey, spokenDefs, intro) {
  const dd = bundle.deep_dive || {};
  const src = dd[mapKey] || {};
  const segs = [];
  spokenDefs.forEach(([k, lbl]) => {
    const t = String(src[k] || "").trim();
    if (t) segs.push(`${lbl}. ${speakable(t)}`);
  });
  if (!segs.length) return "";
  return [intro, ...segs].join("\n\n");
}

function whatToWatchNarration(bundle) {
  const dd = bundle.deep_dive || {};
  const raw = String(dd.what_to_watch || "").trim();
  if (!raw) return "";
  const bullets = raw
    .split("\n")
    .map((b) => b.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  if (!bullets.length) return "";
  const parts = ["What I'd watch next week."];
  bullets.forEach((b) => parts.push(speakable(b).replace(/[.]*$/, "") + "."));
  return parts.join("\n\n");
}

function patternEchoesNarration(bundle) {
  const echoes = bundle.pattern_echoes || bundle.echoes || [];
  if (!echoes.length) return "";
  // Group by event (rank order), mirroring the reader's echo groups.
  const byEvent = new Map();
  const order = [];
  echoes.forEach((e) => {
    const id = e.event_id;
    if (!byEvent.has(id)) {
      byEvent.set(id, { rank: e.event_rank, title: e.event_title, matches: [] });
      order.push(id);
    }
    byEvent.get(id).matches.push(e);
  });
  order.sort((a, b) => (byEvent.get(a).rank || 99) - (byEvent.get(b).rank || 99));

  const parts = ["Pattern echoes. How this week rhymes with the past."];
  order.forEach((id) => {
    const g = byEvent.get(id);
    const lead = `On ${speakable(g.title)}:`;
    const lines = g.matches.map((m) => {
      const name = speakable(m.name);
      const expl = String(m.explanation || "").trim();
      return `this echoes ${name}. ${speakable(expl)}`;
    });
    parts.push([lead, ...lines].join(" "));
  });
  return parts.join("\n\n");
}

// Build the spoken script for one section from an already-loaded DB bundle
// ({ edition, events, deep_dive, pattern_echoes }). Returns "" when the section
// has no readable content this week (the caller then serves a 404 and the reader
// hides that control).
export function sectionNarration(sectionKey, bundle) {
  if (!bundle) return "";
  switch (sectionKey) {
    case "briefing":
      return briefingNarration(bundle.edition, bundle.events || []);
    case "deep_dive":
      return deepDiveNarration(bundle);
    case "gaps":
      return labelledMapNarration(bundle, "gaps", GAP_SPOKEN, "Gaps to fill.");
    case "implications":
      return labelledMapNarration(bundle, "implications", IMP_SPOKEN, "Implications.");
    case "what_to_watch":
      return whatToWatchNarration(bundle);
    case "pattern_echoes":
      return patternEchoesNarration(bundle);
    default:
      return "";
  }
}

export function isValidSectionKey(key) {
  return Object.prototype.hasOwnProperty.call(SECTION_BY_KEY, key);
}

// Content hash for the cache. Folds in the voice + model so a voice change also
// busts the cache; the section text is the primary driver.
export function contentHash(text, voiceId, modelId) {
  return crypto
    .createHash("sha256")
    .update(`${voiceId || ""}|${modelId || ""}|${String(text || "")}`)
    .digest("hex");
}

// Split narration into synthesis chunks that stay under MAX_CHARS_PER_REQUEST,
// preferring paragraph then sentence boundaries so audio joins cleanly.
export function chunkForSynthesis(text, limit = MAX_CHARS_PER_REQUEST) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const paras = clean.split(/\n\n+/);
  const units = [];
  paras.forEach((p) => {
    if (p.length <= limit) { units.push(p); return; }
    // A single oversized paragraph — fall back to sentence splitting.
    const sentences = p.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [p];
    let cur = "";
    sentences.forEach((s) => {
      if ((cur + s).length > limit && cur) { units.push(cur.trim()); cur = ""; }
      if (s.length > limit) {
        // Pathological: hard-split a very long sentence.
        for (let i = 0; i < s.length; i += limit) units.push(s.slice(i, i + limit));
      } else {
        cur += s;
      }
    });
    if (cur.trim()) units.push(cur.trim());
  });

  // Re-pack adjacent units up to the limit to minimise request count.
  const chunks = [];
  let buf = "";
  units.forEach((u) => {
    if (!buf) { buf = u; return; }
    if ((buf + "\n\n" + u).length <= limit) { buf += "\n\n" + u; }
    else { chunks.push(buf); buf = u; }
  });
  if (buf) chunks.push(buf);
  return chunks;
}

// Synthesize arbitrarily long narration by chunking and concatenating the MP3
// buffers. Reuses the existing single-request ElevenLabs call.
export async function synthesizeSection(text, opts = {}) {
  const chunks = chunkForSynthesis(text);
  if (!chunks.length) throw new Error("empty narration");
  if (chunks.length === 1) return synthesizeBriefing(chunks[0], opts);
  const bufs = [];
  for (const c of chunks) {
    bufs.push(await synthesizeBriefing(c, opts)); // sequential — keep credit/rate use gentle
  }
  return Buffer.concat(bufs);
}

// Cache store. Vercel functions run on a read-only filesystem, so the generated
// MP3s live in Postgres and are streamed by /api/seminar/section-audio.
export async function ensureSectionAudioTable(query) {
  await query(
    `create table if not exists public.seminar_section_audio (
       seminar_id   integer not null references public.seminar_editions(id) on delete cascade,
       section_key  text    not null,
       content_hash text    not null,
       mp3          bytea   not null,
       char_count   integer,
       byte_size    integer,
       voice_id     text,
       model_id     text,
       created_at   timestamptz not null default now(),
       updated_at   timestamptz not null default now(),
       primary key (seminar_id, section_key)
     )`,
    []
  );
}
