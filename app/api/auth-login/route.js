// POST /api/auth-login   body: { pin: "1234" }
// Success: { ok:true, token, expires_at }
// Failure: { ok:false, error }
//
// The PIN is verified server-side with scrypt against IRTUTOR_PIN_HASH and
// is NEVER returned or logged. On success we mint a stateless HMAC bearer
// token the browser stores in localStorage.
export const runtime = "nodejs";

import { getSecret, getPinHash, verifyPin, issueToken } from "../../../lib/auth";

export async function POST(req) {
  if (!getSecret() || !getPinHash()) {
    return Response.json(
      { ok: false, error: "Auth not configured. Set IRTUTOR_AUTH_SECRET and IRTUTOR_PIN_HASH in Vercel." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const pin = body && body.pin != null ? String(body.pin) : "";
  if (!/^[0-9]{6}$/.test(pin)) {
    return Response.json({ ok: false, error: "PIN must be 6 digits." }, { status: 400 });
  }

  // scrypt runs on every well-formed 6-digit PIN so timing is roughly
  // constant whether or not the PIN is correct.
  const ok = verifyPin(pin, getPinHash());
  if (!ok) {
    return Response.json({ ok: false, error: "Incorrect PIN." }, { status: 401 });
  }

  const issued = issueToken();
  if (!issued) {
    return Response.json({ ok: false, error: "Failed to issue session token." }, { status: 500 });
  }

  return Response.json({ ok: true, token: issued.token, expires_at: issued.expires_at });
}
