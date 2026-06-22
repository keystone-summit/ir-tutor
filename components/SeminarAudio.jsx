"use client";
// Small "Listen" button for seminar entries (IR theories + historical patterns).
//
// Give it the URL of a pre-generated narration MP3 (see lib/seminarAudio.js).
// It shows a Play button that streams the file; while playing it turns into a
// Pause button with a thin progress bar. If the file isn't there (404 / load
// error) the whole control quietly removes itself, so entries without audio
// just show nothing extra.
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

export default function SeminarAudio({ src, label = "Listen" }) {
  const audioRef = useRef(null);
  const [available, setAvailable] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1

  // A fresh src means a different entry — reset state and stop any playback.
  useEffect(() => {
    setAvailable(true);
    setPlaying(false);
    setProgress(0);
    const a = audioRef.current;
    if (a) { a.pause(); a.currentTime = 0; }
  }, [src]);

  if (!src || !available) return null;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play().catch(() => setAvailable(false)); }
  }

  return (
    <div className="sem-audio">
      <button
        type="button"
        className="sem-audio-btn"
        onClick={toggle}
        aria-label={playing ? "Pause narration" : "Play narration"}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
        <Volume2 size={13} className="sem-audio-ic" />
        <span>{playing ? "Pause" : label}</span>
      </button>
      {progress > 0 && (
        <span className="sem-audio-bar" aria-hidden="true">
          <span className="sem-audio-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
        onError={() => setAvailable(false)}
      />
    </div>
  );
}
