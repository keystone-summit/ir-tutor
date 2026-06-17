"use client";
// /seminar/theories — Phase 3.5 IR Theory Library.
// Same portal-wide PIN gate as every other course/page.
import React from "react";
import AuthGate from "../../../components/AuthGate";
import TheoriesView from "./TheoriesView";

export default function Page() {
  return (
    <AuthGate>
      <TheoriesView />
    </AuthGate>
  );
}
