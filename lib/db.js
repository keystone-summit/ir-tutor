// =====================================================================
// IR Tutor — server-side Postgres access.
//
// After the move off Supabase Auth, the browser no longer talks to
// Supabase directly (the public anon key is gone from the client path).
// Progress + chat persistence now flows through PIN-gated API routes
// that use this pooled connection. We connect as the `postgres` role via
// the Supabase transaction pooler, so Row-Level Security is bypassed —
// the PIN bearer token is the access control now.
//
// Single-user app: all rows are keyed to JOHN_USER_ID.
// =====================================================================

import { Pool } from "pg";

// Fixed identity for the single user (John). The FK to auth.users was
// dropped during the PIN migration, so this no longer needs a real
// Supabase Auth user — it's just a stable partition key.
export const JOHN_USER_ID = "11111111-1111-1111-1111-111111111111";

let _pool = null;

export function getPool() {
  if (_pool) return _pool;
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL env var is not set.");
  }
  _pool = new Pool({
    connectionString,
    // Supabase pooler terminates TLS; no client cert needed.
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return _pool;
}

export async function query(text, params) {
  const pool = getPool();
  const res = await pool.query(text, params);
  return res;
}
