"use client";
// Shared PIN gate for the whole course portal. Every page (the course picker
// and each of the three courses) wraps its content in <AuthGate>. There is
// exactly ONE login surface — the same HMAC bearer token in localStorage
// unlocks all courses. Protected API routes re-verify the token on every
// call, so this is just the client-side gate; a forged/expired token gets a
// 401 from the API and authFetch bounces back here.
import React, { useEffect, useState } from "react";
import Login from "./Login";
import { getToken } from "../lib/clientAuth";

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
    setReady(true);
  }, []);

  if (!ready) return <div className="ir-boot">Loading…</div>;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return children;
}
