"use client";
// /irtutor — the original IR Tutor course (Introduction to International
// Relations). This is the exact Dashboard that used to live at "/"; only the
// auth wrapper changed so it now shares the portal-wide PIN via AuthGate.
import React from "react";
import AuthGate from "../../components/AuthGate";
import Dashboard from "../../components/Dashboard";

export default function Page() {
  // Dashboard.signOut() already clears the token; reloading drops the user
  // back to the shared PIN screen rendered by AuthGate.
  return (
    <AuthGate>
      <Dashboard onSignOut={() => { if (typeof window !== "undefined") window.location.reload(); }} />
    </AuthGate>
  );
}
