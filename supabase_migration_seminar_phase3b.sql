-- ============================================================
--  IR Tutor — FP "Implications Seminar" PHASE 3b
--  Historical Pattern Matcher: a pre-seeded library of historical
--  IR inflection points, plus per-event matches that say how each
--  week's events "rhyme" with the past.
--
--  Run AFTER:
--    supabase_migration_seminar.sql          (Phase 1)
--    supabase_migration_seminar_phase2.sql   (Phase 2)
--    supabase_migration_seminar_phase3a.sql  (Phase 3a)
--
--  Apply with the SESSION pooler (DDL):
--    set SUPA_DB_PASSWORD=...   (see keystone_credentials_MASTER.txt)
--    node scripts/run_sql.js supabase_migration_seminar_phase3b.sql
--
--  IMPORTANT — this app dropped Supabase Auth during the PIN migration.
--  There is NO auth.users table; the API connects as the `postgres` role
--  via the pooler (RLS bypassed; the PIN bearer is the access control).
--  So, like every other seminar table, the ids here are BIGINT identities,
--  not uuids. RLS is enabled as defense-in-depth (no policies — the role
--  bypasses RLS, anon has no grant).
--
--  IDEMPOTENT: safe to run repeatedly.
-- ============================================================

-- ---------- seminar_historical_patterns: the pre-seeded library ----------
create table if not exists public.seminar_historical_patterns (
  id                         bigint generated always as identity primary key,
  name                       text not null,
  pattern_type               text not null,
  era                        text,
  date_range                 text,
  region                     text,
  parties                    text[],
  description                text not null,
  what_happened              text,
  outcome                    text,
  lessons                    text,
  modern_relevance_keywords  text[],
  created_at                 timestamptz not null default now()
);

-- Name is the natural key for the idempotent seed upsert.
create unique index if not exists historical_patterns_name_uidx
  on public.seminar_historical_patterns (lower(name));
create index if not exists historical_patterns_type_idx
  on public.seminar_historical_patterns (pattern_type);
create index if not exists historical_patterns_region_idx
  on public.seminar_historical_patterns (region);
create index if not exists historical_patterns_era_idx
  on public.seminar_historical_patterns (era);

-- ---------- seminar_pattern_matches: this week's events <-> the library ----------
create table if not exists public.seminar_pattern_matches (
  id                    bigint generated always as identity primary key,
  seminar_event_id      bigint not null references public.seminar_events (id) on delete cascade,
  historical_pattern_id bigint not null references public.seminar_historical_patterns (id) on delete cascade,
  match_strength        int    not null check (match_strength between 1 and 10),
  explanation           text   not null,
  created_at            timestamptz not null default now()
);

create unique index if not exists pattern_matches_unique
  on public.seminar_pattern_matches (seminar_event_id, historical_pattern_id);
create index if not exists pattern_matches_pattern_idx
  on public.seminar_pattern_matches (historical_pattern_id);

alter table public.seminar_historical_patterns enable row level security;
alter table public.seminar_pattern_matches      enable row level security;
