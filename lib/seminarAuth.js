// Auth gate for the seminar pipeline endpoints (ingest / generate).
//
// These run two ways:
//   1. Vercel Cron — Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
//   2. Manual trigger (the one-time Week-1 seed, or a re-run) — a curl with
//      the SEMINAR_CRON_SECRET bearer, OR a logged-in user's PIN token.
//
// So we accept EITHER a valid IR-Tutor PIN bearer (requireAuth) OR a bearer
// equal to SEMINAR_CRON_SECRET / CRON_SECRET. Read-only seminar endpoints
// (current / archive) use the normal requireAuth instead.
import crypto from "node:crypto";
import { requireAuth } from "./auth";

function timingEq(a, b) {
  if (!a || !b) return false;
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch { return false; }
}

export function requireCronOrAuth(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : header.trim();

  const secret = process.env.SEMINAR_CRON_SECRET || process.env.CRON_SECRET;
  if (secret && timingEq(token, secret)) return { ok: true, via: "cron" };

  const v = requireAuth(req);
  if (v.ok) return { ok: true, via: "pin" };
  return { ok: false, status: 401, error: "not authenticated (cron secret or PIN required)" };
}
