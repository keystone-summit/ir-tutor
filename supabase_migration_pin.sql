-- ============================================================
--  IR Tutor — Change-PIN support
--  Run this in the Supabase SQL Editor AFTER the project is live
--  (the project was paused; restore it first, then run this).
--
--  These tables let the PIN be rotated at runtime and stored
--  permanently (hashed). The IRTUTOR_PIN_HASH env var remains the
--  bootstrap default + fail-open fallback when the DB is unreachable,
--  so login never breaks if the project pauses again.
-- ============================================================

-- Canonical PIN hash once the user changes it (single-user app).
create table if not exists public.app_auth (
  user_id       uuid        primary key,
  pin_hash      text        not null,            -- scrypt$<salt>$<hash> (same scheme as IRTUTOR_PIN_HASH)
  session_epoch int         not null default 0,  -- bumped on each change (session-rotation marker)
  updated_at    timestamptz not null default now()
);

-- Audit trail: one row per PIN-change attempt (success or failure).
-- Doubles as the brute-force rate-limit source (failed rows in the last hour).
create table if not exists public.pin_change_audit (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null,
  changed_at  timestamptz not null default now(),
  success     boolean     not null,
  detail      text
);
create index if not exists pin_change_audit_user_time_idx
  on public.pin_change_audit (user_id, changed_at desc);

-- Defense in depth: deny anon/authenticated; the API connects as the
-- postgres role through the pooler, which bypasses RLS (same posture as
-- progress / chat_messages).
alter table public.app_auth         enable row level security;
alter table public.pin_change_audit enable row level security;
