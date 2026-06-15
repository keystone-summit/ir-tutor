"use client";
// /seminar — Foreign Policy Implications Seminar (Phase 1).
// Shares the portal-wide PIN via AuthGate, like every other course.
import React from "react";
import AuthGate from "../../components/AuthGate";
import SeminarView from "./SeminarView";

export default function Page() {
  return (
    <AuthGate>
      <SeminarView />
    </AuthGate>
  );
}
