"use client";
// /seminar/patterns — Phase 3b Library of Patterns.
// Same portal-wide PIN gate as every other course/page.
import React from "react";
import AuthGate from "../../../components/AuthGate";
import PatternsView from "./PatternsView";

export default function Page() {
  return (
    <AuthGate>
      <PatternsView />
    </AuthGate>
  );
}
