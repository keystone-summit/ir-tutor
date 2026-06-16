"use client";
// /seminar/graph — Phase 3a Live Actor Graph.
// Same portal-wide PIN gate as every other course/page.
import React from "react";
import AuthGate from "../../../components/AuthGate";
import GraphView from "./GraphView";

export default function Page() {
  return (
    <AuthGate>
      <GraphView />
    </AuthGate>
  );
}
