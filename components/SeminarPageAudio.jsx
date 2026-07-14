"use client";
// Whole-page narration controller for the Foreign Policy seminar reader.
//
// One shared <audio> element drives both a "Listen to whole page" bar at the top
// of the reader and a "Listen to this section" button on each section header.
// A single controller keeps them in sync: starting the whole page, pausing a
// section, or skipping forward all act on the same playback.
//
// - Whole page: plays each present section in order with a brief pause between,
//   auto-skipping any section whose audio isn't available.
// - Per section: plays just that section and highlights it.
// - The section currently narrating gets an `is-narrating` class (added to its
//   <section id> in the DOM) and, in whole-page mode, is scrolled into view.
//
// Audio is streamed from /api/seminar/section-audio, which generates on first
// play and caches by content hash — so the first play of a section takes a
// moment ("Preparing audio") and later plays start immediately.
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { Play, Pause, Volume2, SkipBack, SkipForward, Loader2 } from "lucide-react";

const GAP_BETWEEN_SECTIONS_MS = 700;

const Ctx = createContext(null);
export function useSectionAudio() { return useContext(Ctx); }

export function SectionAudioProvider({ playlist, children }) {
  const items = useMemo(() => (Array.isArray(playlist) ? playlist : []), [playlist]);
  const audioRef = useRef(null);

  const [idx, setIdx] = useState(-1);       // index into items, or -1 = none
  const [mode, setMode] = useState(null);   // 'all' | 'single' | null
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [unavailable, setUnavailable] = useState(() => new Set());

  // Refs so the imperative <audio> event handlers read live values.
  const idxRef = useRef(-1);
  const modeRef = useRef(null);
  const unavailRef = useRef(unavailable);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { unavailRef.current = unavailable; }, [unavailable]);

  const activeKey = idx >= 0 && idx < items.length ? items[idx].key : null;

  // Highlight the narrating section in the DOM, and follow along in whole-page
  // mode. Uses the DOM directly to avoid threading a class through every
  // section in SeminarView.
  useEffect(() => {
    const id = activeKey ? (items.find((i) => i.key === activeKey) || {}).domId : null;
    items.forEach((it) => {
      const el = typeof document !== "undefined" && it.domId ? document.getElementById(it.domId) : null;
      if (el) el.classList.toggle("is-narrating", it.domId === id && playing);
    });
    if (id && modeRef.current === "all" && playing) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeKey, playing, items]);

  // Reset everything if the playlist identity changes (new edition loaded).
  useEffect(() => {
    const a = audioRef.current;
    if (a) { a.pause(); }
    setIdx(-1); setMode(null); setPlaying(false); setLoading(false); setProgress(0);
    setUnavailable(new Set());
  }, [items]);

  const firstAvailable = useCallback((from = 0, dir = 1) => {
    for (let i = from; i >= 0 && i < items.length; i += dir) {
      if (!unavailRef.current.has(items[i].key)) return i;
    }
    return -1;
  }, [items]);

  const loadAndPlay = useCallback((index, nextMode) => {
    const a = audioRef.current;
    const item = items[index];
    if (!a || !item) return;
    // Retrying a section that errored before — give it a clean chance.
    if (unavailRef.current.has(item.key)) {
      setUnavailable((s) => { const n = new Set(s); n.delete(item.key); unavailRef.current = n; return n; });
    }
    setIdx(index); idxRef.current = index;
    setMode(nextMode); modeRef.current = nextMode;
    setProgress(0);
    setLoading(true);
    a.src = item.url;
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => { /* autoplay/policy or load error — onError handles fallback */ });
    }
  }, [items]);

  const startWholePage = useCallback(() => {
    const start = firstAvailable(0, 1);
    if (start < 0) return;
    loadAndPlay(start, "all");
  }, [firstAvailable, loadAndPlay]);

  const pause = useCallback(() => { const a = audioRef.current; if (a) a.pause(); }, []);
  const resume = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (idxRef.current < 0) { startWholePage(); return; }
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, [startWholePage]);

  const playSection = useCallback((key) => {
    const index = items.findIndex((i) => i.key === key);
    if (index < 0) return;
    // Toggle: clicking the active, playing section pauses it.
    if (index === idxRef.current && playing) { pause(); return; }
    if (index === idxRef.current && !playing) { resume(); return; }
    loadAndPlay(index, "single");
  }, [items, playing, pause, resume, loadAndPlay]);

  const skip = useCallback((dir) => {
    const base = idxRef.current < 0 ? (dir > 0 ? -1 : items.length) : idxRef.current;
    const target = firstAvailable(base + dir, dir);
    if (target < 0) return;
    loadAndPlay(target, modeRef.current || "all");
  }, [firstAvailable, loadAndPlay, items.length]);

  // --- <audio> event wiring -------------------------------------------------
  function onEnded() {
    setPlaying(false);
    setProgress(0);
    if (modeRef.current === "all") {
      const next = firstAvailable(idxRef.current + 1, 1);
      if (next >= 0) {
        window.setTimeout(() => loadAndPlay(next, "all"), GAP_BETWEEN_SECTIONS_MS);
        return;
      }
    }
    // Single section finished, or whole page reached the end.
    setIdx(-1); setMode(null);
  }

  function onError() {
    // Mark the current section unavailable (no content / no voice key / 404).
    const cur = idxRef.current;
    if (cur < 0 || cur >= items.length) { setLoading(false); return; }
    const key = items[cur].key;
    setUnavailable((s) => { const n = new Set(s); n.add(key); unavailRef.current = n; return n; });
    setLoading(false);
    setPlaying(false);
    if (modeRef.current === "all") {
      const next = firstAvailable(cur + 1, 1);
      if (next >= 0) { loadAndPlay(next, "all"); return; }
    }
    setIdx(-1); setMode(null);
  }

  const value = {
    items,
    activeKey,
    playing,
    loading,
    mode,
    progress,
    isUnavailable: (key) => unavailable.has(key),
    startWholePage,
    pause,
    resume,
    playSection,
    skip,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => { setPlaying(true); setLoading(false); }}
        onPlay={() => setPlaying(true)}
        onWaiting={() => setLoading(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        onError={onError}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
      />
    </Ctx.Provider>
  );
}

// Top-of-page control: play the whole page, pause/resume, and skip between
// sections with a now-playing readout.
export function WholePageAudioBar() {
  const ctx = useSectionAudio();
  if (!ctx || !ctx.items.length) return null;
  const { items, activeKey, playing, loading, progress, startWholePage, pause, resume, skip } = ctx;

  const active = activeKey ? items.find((i) => i.key === activeKey) : null;
  const pos = active ? items.findIndex((i) => i.key === activeKey) + 1 : 0;
  const started = pos > 0;

  function onPrimary() {
    if (playing) pause();
    else if (started) resume();
    else startWholePage();
  }

  return (
    <div className="sem-pageaudio">
      <button
        type="button"
        className="sem-pageaudio-play"
        onClick={onPrimary}
        aria-label={playing ? "Pause narration" : "Listen to whole page"}
      >
        {loading ? <Loader2 size={15} className="sem-spin" /> : playing ? <Pause size={15} /> : <Play size={15} />}
        <Volume2 size={14} className="sem-audio-ic" />
        <span>{playing ? "Pause" : started ? "Resume" : "Listen to whole page"}</span>
      </button>

      {started && (
        <div className="sem-pageaudio-nav">
          <button type="button" className="sem-pageaudio-skip" onClick={() => skip(-1)} aria-label="Previous section">
            <SkipBack size={14} />
          </button>
          <span className="sem-pageaudio-now">
            {loading ? "Preparing audio" : active ? active.label : ""} <span className="sem-pageaudio-pos">{pos} of {items.length}</span>
          </span>
          <button type="button" className="sem-pageaudio-skip" onClick={() => skip(1)} aria-label="Next section">
            <SkipForward size={14} />
          </button>
        </div>
      )}

      <span className="sem-pageaudio-bar" aria-hidden="true">
        <span className="sem-pageaudio-fill" style={{ width: `${Math.round((started ? progress : 0) * 100)}%` }} />
      </span>
    </div>
  );
}

// Per-section header control: "Listen to this section". Shown for any section
// that is on the page (in the playlist). We deliberately do NOT hide it when a
// prior play errored (e.g. a transient synth timeout) — the section still has
// content, so the button stays visible and clicking it retries.
export function SectionListenButton({ sectionKey }) {
  const ctx = useSectionAudio();
  if (!ctx) return null;
  const inList = ctx.items.some((i) => i.key === sectionKey);
  if (!inList) return null;

  const isActive = ctx.activeKey === sectionKey;
  const isPlaying = isActive && ctx.playing;
  const isLoading = isActive && ctx.loading;

  return (
    <button
      type="button"
      className={`sem-seclisten ${isActive ? "active" : ""}`}
      onClick={() => ctx.playSection(sectionKey)}
      aria-label={isPlaying ? "Pause this section" : "Listen to this section"}
      title={isPlaying ? "Pause" : "Listen to this section"}
    >
      {isLoading ? <Loader2 size={13} className="sem-spin" /> : isPlaying ? <Pause size={13} /> : <Play size={13} />}
      <span>{isPlaying ? "Pause" : isLoading ? "Preparing" : "Listen to this section"}</span>
    </button>
  );
}
