// POST /api/auth/change-pin
//   body: { currentPin, newPin, confirmPin }
//   success: { ok:true, reauth:true }   failure: { ok:false, error }
//
// Auth model: proving the CURRENT PIN (scrypt hash-match) is the gate, so the
// modal works from the login screen (no session yet). A bearer token is also
// accepted when present (settings page) but is not required — the current-PIN
// check plus the per-hour rate limit are the brute-force defense.
//
// The new PIN is hashed with the same scrypt scheme as IRTUTOR_PIN_HASH and
// stored in public.app_auth (permanent). Every attempt is audited.
export const runtime = "nodejs";

import { getSecret, getPinHash, verifyPin, hashPin } from "../../../../lib/auth";
import {
  getEffectivePinHash,
  setPinHash,
  recordAudit,
  recentFailedAttempts,
} from "../../../../lib/pinStore";

const PIN_RE = /^[0-9]{6}$/; // matches the 6-digit login-keypad policy
const MAX_FAILS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const OFFLINE = "PIN store is offline. Restore the Supabase project, then try again.";

export async function POST(req) {
  if (!getSecret() || !getPinHash()) {
    return Response.json({ ok: false, error: "Auth not configured." }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const currentPin = body && body.currentPin != null ? String(body.currentPin) : "";
  const newPin = body && body.newPin != null ? String(body.newPin) : "";
  const confirmPin = body && body.confirmPin != null ? String(body.confirmPin) : "";

  if (!PIN_RE.test(currentPin) || !PIN_RE.test(newPin)) {
    return Response.json({ ok: false, error: "PINs must be 6 digits." }, { status: 400 });
  }
  if (newPin !== confirmPin) {
    return Response.json({ ok: false, error: "New PIN and confirmation do not match." }, { status: 400 });
  }
  if (newPin === currentPin) {
    return Response.json({ ok: false, error: "New PIN must be different from the current PIN." }, { status: 400 });
  }

  // Brute-force rate limit (DB-backed). A DB failure here also means the PIN
  // store is offline, so surface that clearly rather than silently allowing it.
  try {
    if ((await recentFailedAttempts(HOUR_MS)) >= MAX_FAILS_PER_HOUR) {
      return Response.json(
        { ok: false, error: "Too many attempts. Please wait an hour and try again." },
        { status: 429 }
      );
    }
  } catch {
    return Response.json({ ok: false, error: OFFLINE }, { status: 503 });
  }

  // Verify the current PIN against the effective (DB-or-env) hash.
  const effective = await getEffectivePinHash();
  if (!verifyPin(currentPin, effective)) {
    await recordAudit(false, "wrong current PIN");
    return Response.json({ ok: false, error: "Current PIN is incorrect." }, { status: 401 });
  }

  // Persist the new hash. A DB failure here must NOT report success.
  try {
    await setPinHash(hashPin(newPin));
  } catch {
    return Response.json({ ok: false, error: OFFLINE }, { status: 503 });
  }

  await recordAudit(true, "pin changed");
  return Response.json({ ok: true, reauth: true });
}
