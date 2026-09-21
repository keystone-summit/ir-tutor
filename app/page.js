"use client";
// Home = course picker. Three cards, one per course, all behind the same PIN.
// The existing IR Tutor course moved to /irtutor; this page replaced it at /.
import React, { useState } from "react";
import { GraduationCap, BookOpen, Languages, LogOut, ChevronRight, KeyRound, Globe } from "lucide-react";
import AuthGate from "../components/AuthGate";
import ChangePinModal from "../components/ChangePinModal";
import { clearToken } from "../lib/clientAuth";

const COURSES = [
  {
    href: "/irtutor",
    code: "IAFF / PSC 1001",
    title: "Introduction to International Relations",
    sub: "Classical Realism, Strategy & Analysis",
    meta: "14 weeks · 3 credits · AI Socratic tutor",
    Icon: GraduationCap,
    tone: "ir",
  },
  {
    href: "/write1001",
    code: "WRITE 1001",
    title: "Foundations of Academic Writing",
    sub: "From Sentence Mechanics to Argumentative Mastery",
    meta: "14 weeks · 3 credits · AI writing tutor",
    Icon: BookOpen,
    tone: "write",
  },
  {
    href: "/roots",
    code: "ROOTS 1001",
    title: "Greek & Latin Roots",
    sub: "~70 roots that unlock thousands of English words",
    meta: "14 weeks · 3 credits · AI etymology tutor",
    Icon: Languages,
    tone: "roots",
  },
];

function Picker() {
  const [showChangePin, setShowChangePin] = useState(false);
  function signOut() {
    clearToken();
    if (typeof window !== "undefined") window.location.reload();
  }
  return (
    <div className="coursepicker">
      <div className="cp-toolbar">
        <button className="cp-toolbtn" onClick={() => setShowChangePin(true)} title="Change PIN">
          <KeyRound size={15} /> Change PIN
        </button>
        <button className="cp-signout" onClick={signOut} title="Sign out">
          <LogOut size={15} /> Sign out
        </button>
      </div>
      {showChangePin && <ChangePinModal onClose={() => setShowChangePin(false)} />}
      <header className="cp-head">
        <div className="cp-crest"><GraduationCap size={28} /></div>
        <div className="cp-kicker">Keystone Summit</div>
        <h1>Course Portal</h1>
        <p>Choose a course to begin. One PIN unlocks them all.</p>
      </header>

      <div className="cp-grid">
        {COURSES.map((c) => (
          <a key={c.href} href={c.href} className={`cp-card ${c.tone}`}>
            <div className="cp-icon"><c.Icon size={26} /></div>
            <div className="cp-code">{c.code}</div>
            <h2>{c.title}</h2>
            <p className="cp-sub">{c.sub}</p>
            <div className="cp-meta">{c.meta}</div>
            <span className="cp-go">Open course <ChevronRight size={16} /></span>
          </a>
        ))}
      </div>

      <a href="/seminar" className="cp-seminar">
        <div className="cp-seminar-icon"><Globe size={24} /></div>
        <div className="cp-seminar-body">
          <div className="cp-seminar-kicker">New · weekly</div>
          <h2>Foreign Policy — Implications Seminar</h2>
          <p>A current-events deep-dive that publishes Monday mornings: the week's 15 events,
            split across emerging foreign policy, terrorism, cartels &amp; narcotics and the Americas
            (Iran war capped at 5), a five-layer / five-lens deep dive, gaps to fill, and what to watch next.</p>
        </div>
        <span className="cp-go">Open seminar <ChevronRight size={16} /></span>
      </a>

      <a href="/leaders" className="cp-seminar cp-leaders-card">
        <div className="cp-seminar-icon"><Globe size={24} /></div>
        <div className="cp-seminar-body">
          <div className="cp-seminar-kicker">Reference · 57 leaders</div>
          <h2>Keystone Atlas — World Leaders</h2>
          <p>Every top leader, top diplomat, defense minister, intel service, and nuclear status
            for the 57 countries in the Atlas. Filterable grid + 5-round self-test.</p>
          <div className="cp-leaders-sub">
            <a href="/leaders" className="cp-leaders-sublink">Overview</a>
            <span className="cp-leaders-dot">·</span>
            <a href="/leaders/study" className="cp-leaders-sublink">Study Mode</a>
          </div>
        </div>
        <span className="cp-go">Open atlas <ChevronRight size={16} /></span>
      </a>

      <footer className="cp-foot">Keystone Summit · self-paced learning</footer>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Picker />
    </AuthGate>
  );
}
