// Idempotency guard for the marquee Deep Dive (/api/seminar/deepen).
//
// The Deep Dive has TWO triggers by design:
//   1. Fire-and-forget from /api/seminar/generate (and, via generate, from the
//      daily /api/seminar/heartbeat self-heal).
//   2. The Vercel cron at Monday 11:30 UTC.
//
// Trigger 1 is best-effort and cannot be relied on: it is a bare
// `fetch(...).catch(() => {})` that is never awaited, so the serverless runtime
// may freeze the function before the request leaves, and any failure is
// swallowed silently. It is also skipped entirely when no cron secret is set.
// Trigger 2 therefore stays in place as the safety net.
//
// With both triggers live, whichever one runs second used to re-pay for a
// Claude call and then delete+insert over a perfectly good deep dive. This
// guard makes the endpoint genuinely idempotent — the second trigger becomes a
// cheap no-op — so exactly one Deep Dive is paid for per edition however many
// times the endpoint is hit.
//
// Pure function: no DB, no network, so it is unit-testable.

// `existing` is the seminar_deep_dive row already stored for the edition
// (or null / undefined when there is none). `force` is the operator escape
// hatch (?force=1) for a deliberate re-write.
export function shouldRunDeepDive({ existing, force = false } = {}) {
  if (force) return { run: true, reason: "force" };
  if (existing) return { run: false, reason: "already_exists" };
  return { run: true, reason: "missing" };
}
