"use client";
import React, { useEffect, useState } from "react";
import Login from "../components/Login";
import Dashboard from "../components/Dashboard";
import { getToken } from "../lib/clientAuth";

export default function Page() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // A token in localStorage means a prior PIN entry that hasn't expired
    // client-side. Protected API routes re-verify the HMAC on every call,
    // so a forged/expired token can't actually read or write anything —
    // it just gets a 401 and authFetch bounces back to the PIN screen.
    setAuthed(!!getToken());
    setReady(true);
  }, []);

  if (!ready) return <div className="ir-boot">Loading…</div>;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Dashboard onSignOut={() => setAuthed(false)} />;
}
