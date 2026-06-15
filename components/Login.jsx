"use client";
import React, { useState, useEffect, useCallback } from "react";
import { GraduationCap, Delete } from "lucide-react";
import { setToken } from "../lib/clientAuth";
import ChangePinModal from "./ChangePinModal";

const PIN_LEN = 6; // 6-digit PIN; default PIN is 123456

export default function Login({
  onAuthed,
  code = "KEYSTONE SUMMIT",
  title = "Course Portal",
  sub = "Enter your PIN to continue",
}) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);

  const submit = useCallback(async (value) => {
    const code = (value ?? pin).trim();
    if (code.length !== PIN_LEN || busy) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/auth-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.token) {
        setToken(data.token);
        onAuthed && onAuthed();
      } else {
        setMsg(data.error || "Incorrect PIN.");
        setPin("");
        setShake(true);
        setTimeout(() => setShake(false), 420);
      }
    } catch {
      setMsg("Something went wrong. Please try again.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }, [pin, busy, onAuthed]);

  const press = useCallback((d) => {
    if (busy) return;
    setMsg("");
    setPin((p) => {
      if (p.length >= PIN_LEN) return p;
      const next = p + d;
      // auto-submit on the 6th digit
      if (next.length === PIN_LEN) setTimeout(() => submit(next), 60);
      return next;
    });
  }, [busy, submit]);

  const back = useCallback(() => { if (!busy) { setMsg(""); setPin((p) => p.slice(0, -1)); } }, [busy]);

  // Hardware-keyboard support: digits, Backspace, Enter.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back, submit]);

  return (
    <div className="ir-login">
      <div className={`ir-logincard ${shake ? "ir-shake" : ""}`}>
        <div className="ir-crest big"><GraduationCap size={26} /></div>
        <div className="ir-logincode">{code}</div>
        <h1>{title}</h1>
        <p className="ir-loginsub">{sub}</p>

        <div className="ir-pindots">
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <span key={i} className={`ir-pindot ${i < pin.length ? "on" : ""}`} />
          ))}
        </div>

        <div className="ir-keypad">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button key={d} className="ir-key" onClick={() => press(d)} disabled={busy}>{d}</button>
          ))}
          <button className="ir-key ir-key-ghost" onClick={back} disabled={busy} aria-label="Delete">
            <Delete size={20} />
          </button>
          <button className="ir-key" onClick={() => press("0")} disabled={busy}>0</button>
          <button className="ir-key ir-key-enter" onClick={() => submit()} disabled={busy || pin.length !== PIN_LEN} aria-label="Enter">
            {busy ? "…" : "↵"}
          </button>
        </div>

        {msg && <p className="ir-loginmsg">{msg}</p>}

        <button type="button" className="ir-changepin-link" onClick={() => setShowChangePin(true)} disabled={busy}>
          Change PIN
        </button>
      </div>

      {showChangePin && <ChangePinModal onClose={() => setShowChangePin(false)} />}
    </div>
  );
}
