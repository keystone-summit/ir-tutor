"use client";
// Shared "Change PIN" modal. Used from the login screen (no session yet —
// the current PIN is the auth) and from the picker/settings (logged in —
// the bearer token is attached too). Posts to /api/auth/change-pin.
import { useState } from "react";
import { getToken, clearToken } from "../lib/clientAuth";

const onlyDigits = (s) => s.replace(/\D/g, "").slice(0, 6);

export default function ChangePinModal({ onClose }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    if (e) e.preventDefault();
    setMsg("");
    if (cur.length !== 6 || nw.length !== 6 || cf.length !== 6) {
      setMsg("All PINs must be 6 digits.");
      return;
    }
    if (nw !== cf) {
      setMsg("New PIN and confirmation do not match.");
      return;
    }
    if (nw === cur) {
      setMsg("New PIN must be different from your current PIN.");
      return;
    }
    setBusy(true);
    try {
      const token = getToken();
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ currentPin: cur, newPin: nw, confirmPin: cf }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDone(true);
        setMsg("PIN changed. Signing you out so you can log in with the new PIN…");
        clearToken(); // invalidate this device's session; force re-auth
        setTimeout(() => {
          if (typeof window !== "undefined") window.location.reload();
        }, 1800);
      } else {
        setMsg(data.error || "Could not change PIN.");
      }
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cpin-overlay" onClick={() => !busy && onClose && onClose()}>
      <div className="cpin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Change PIN</h3>
        <form onSubmit={submit}>
          <label className="cpin-field">
            <span>Current PIN</span>
            <input type="password" inputMode="numeric" autoComplete="off" value={cur}
              onChange={(e) => setCur(onlyDigits(e.target.value))} disabled={busy || done} placeholder="••••••" />
          </label>
          <label className="cpin-field">
            <span>New PIN</span>
            <input type="password" inputMode="numeric" autoComplete="off" value={nw}
              onChange={(e) => setNw(onlyDigits(e.target.value))} disabled={busy || done} placeholder="••••••" />
          </label>
          <label className="cpin-field">
            <span>Confirm New PIN</span>
            <input type="password" inputMode="numeric" autoComplete="off" value={cf}
              onChange={(e) => setCf(onlyDigits(e.target.value))} disabled={busy || done} placeholder="••••••" />
          </label>
          {msg && <p className={`cpin-msg ${done ? "ok" : ""}`}>{msg}</p>}
          <div className="cpin-actions">
            <button type="button" className="cpin-btn ghost" onClick={() => onClose && onClose()} disabled={busy}>
              Close
            </button>
            <button type="submit" className="cpin-btn" disabled={busy || done}>
              {busy ? "Saving…" : "Change PIN"}
            </button>
          </div>
        </form>
        <p className="cpin-hint">6-digit PIN. Stored encrypted (scrypt); never shown.</p>
      </div>
    </div>
  );
}
