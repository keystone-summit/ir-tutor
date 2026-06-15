// =====================================================================
// IR Tutor — server-side PIN store.
//
// The canonical PIN hash lives in the DB (public.app_auth) once the user
// changes it. The IRTUTOR_PIN_HASH env var is the bootstrap default and the
// fail-open fallback whenever the DB is unreachable (the free Supabase
// project can auto-pause). This keeps /api/auth-login working — and the AI
// tutor reachable — even while the database is down.
//
// Login reads the *effective* hash (DB-first, env fallback). The token /
// requireAuth path stays entirely DB-free so a DB pause never logs the user
// out mid-session or stalls the tutor proxy.
// =====================================================================

import { query, JOHN_USER_ID } from "./db";
import { getPinHash } from "./auth";

const RACE_MS = 2500; // fail open fast if the DB is paused/slow

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("db-timeout")), ms)),
  ]);
}

// Effective hash = DB row if present & reachable, otherwise the env default.
// If the user has changed their PIN, the DB row is authoritative and the old
// env PIN no longer works — unless the DB is unreachable, in which case we
// fall back to the env PIN so the user is never locked out.
export async function getEffectivePinHash() {
  try {
    const r = await withTimeout(
      query("select pin_hash from public.app_auth where user_id = $1", [JOHN_USER_ID]),
      RACE_MS
    );
    if (r.rows.length && r.rows[0].pin_hash) return r.rows[0].pin_hash;
  } catch {
    /* DB paused/slow — fall through to env */
  }
  return getPinHash();
}

// Persist a new hash and bump the session epoch. Throws on DB failure so the
// caller can surface a clear "store offline" message.
export async function setPinHash(hash) {
  await query(
    `insert into public.app_auth (user_id, pin_hash, session_epoch, updated_at)
     values ($1, $2, 1, now())
     on conflict (user_id)
     do update set pin_hash = excluded.pin_hash,
                   session_epoch = public.app_auth.session_epoch + 1,
                   updated_at = now()`,
    [JOHN_USER_ID, hash]
  );
}

// Audit every change attempt (best-effort — never blocks the result).
export async function recordAudit(success, detail) {
  try {
    await query(
      "insert into public.pin_change_audit (user_id, success, detail) values ($1, $2, $3)",
      [JOHN_USER_ID, !!success, detail || null]
    );
  } catch {
    /* audit is best-effort */
  }
}

// Count failed attempts in the trailing window (brute-force rate limit).
// Throws on DB failure so the caller can treat it as "store offline".
export async function recentFailedAttempts(windowMs) {
  const r = await query(
    `select count(*)::int as c from public.pin_change_audit
      where user_id = $1
        and success = false
        and changed_at > now() - ($2::bigint * interval '1 millisecond')`,
    [JOHN_USER_ID, windowMs]
  );
  return r.rows[0] ? r.rows[0].c : 0;
}
