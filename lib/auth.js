// =====================================================================
// IR Tutor — server-side PIN auth (HMAC bearer token + scrypt PIN hash)
//
// Mirrors the Coach Dashboard pattern (api/_lib/coach-auth.js): the PIN
// is verified server-side with scrypt and NEVER leaves the server; the
// session token is a self-contained, stateless HMAC-SHA256 token so no
// session table is needed.
//
// This is a single-user personal app (John). There is exactly one PIN,
// stored hashed in the IRTUTOR_PIN_HASH env var. It is a 6-digit PIN;
// the default is 123456.
//
// Token format:
//   irt.<expiryUnixSeconds>.<hexHmac>
//   where the HMAC is over "irt.<expiry>" using IRTUTOR_AUTH_SECRET.
//
// PIN hash format (same as Coach):
//   "scrypt$" || <salt-hex> || "$" || <hash-hex>
// =====================================================================

import crypto from "node:crypto";

// 30 days. This is a personal study app — re-typing a PIN every hour
// would be hostile. The token is stored in localStorage on the device.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const TOKEN_SUBJECT = "irt";

export function getSecret() {
  const s = process.env.IRTUTOR_AUTH_SECRET;
  if (!s || typeof s !== "string" || s.length < 16) return null;
  return s;
}

export function getPinHash() {
  const h = process.env.IRTUTOR_PIN_HASH;
  if (!h || typeof h !== "string") return null;
  return h;
}

function hmac(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqHex(aHex, bHex) {
  if (!aHex || !bHex || aHex.length !== bHex.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(aHex, "hex"), Buffer.from(bHex, "hex"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// PIN verification (scrypt) — same algorithm as the Coach Dashboard.
// ---------------------------------------------------------------------
export function verifyPin(pinPlaintext, stored) {
  if (!pinPlaintext || !stored || typeof stored !== "string") return false;
  const parts = stored.split("$"); // scrypt$<saltHex>$<hashHex>
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const saltHex = parts[1];
  const hashHex = parts[2];
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  try {
    const saltBuf = Buffer.from(saltHex, "hex");
    const keylen = hashHex.length / 2;
    const computed = crypto.scryptSync(String(pinPlaintext), saltBuf, keylen);
    return crypto.timingSafeEqual(computed, Buffer.from(hashHex, "hex"));
  } catch {
    return false;
  }
}

export function hashPin(pinPlaintext) {
  const saltHex = crypto.randomBytes(16).toString("hex");
  const hashHex = crypto
    .scryptSync(String(pinPlaintext), Buffer.from(saltHex, "hex"), 64)
    .toString("hex");
  return "scrypt$" + saltHex + "$" + hashHex;
}

// ---------------------------------------------------------------------
// Token issue / verify
// ---------------------------------------------------------------------
export function issueToken() {
  const secret = getSecret();
  if (!secret) return null;
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const prefix = TOKEN_SUBJECT + "." + String(expiry);
  const mac = hmac(prefix, secret);
  return { token: prefix + "." + mac, expires_at: new Date(expiry * 1000).toISOString() };
}

// Returns { ok:true, expires_at } on success, or { ok:false, error } on failure.
export function verifyToken(token) {
  const secret = getSecret();
  if (!secret) return { ok: false, error: "auth not configured" };
  if (!token || typeof token !== "string") return { ok: false, error: "missing token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed token" };
  const [sub, expiryStr, mac] = parts;
  if (sub !== TOKEN_SUBJECT) return { ok: false, error: "bad subject" };
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) return { ok: false, error: "bad expiry" };
  if (Math.floor(Date.now() / 1000) > expiry) return { ok: false, error: "expired" };
  const expected = hmac(TOKEN_SUBJECT + "." + expiryStr, secret);
  if (!timingSafeEqHex(mac, expected)) return { ok: false, error: "bad signature" };
  return { ok: true, expires_at: new Date(expiry * 1000).toISOString() };
}

// ---------------------------------------------------------------------
// requireAuth — guard for protected route handlers (App Router).
// Reads the bearer token from the Authorization header.
// Returns { ok:true } or { ok:false, status, error }.
// ---------------------------------------------------------------------
export function requireAuth(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : header.trim();
  const v = verifyToken(token);
  if (!v.ok) return { ok: false, status: 401, error: v.error || "not authenticated" };
  return v;
}
