-- ============================================================
--  IR Tutor — FP "Implications Seminar" PHASE 2
--  Party click-in cards + Debate Room.
--
--  Run AFTER supabase_migration_seminar.sql (Phase 1).
--  Apply with the session pooler (DDL):
--    set SUPA_DB_PASSWORD=...   (see keystone_credentials_MASTER.txt)
--    node scripts/run_sql.js supabase_migration_seminar_phase2.sql
--
--  IMPORTANT — this app dropped Supabase Auth during the PIN migration.
--  There is NO auth.users table and the API connects as the `postgres`
--  role via the pooler (RLS bypassed; the PIN bearer is the access
--  control). So — unlike the spec's reference DDL — we DO NOT reference
--  auth.users / auth.uid(), seminar_id is BIGINT (matching
--  seminar_editions.id, which is a bigint identity, not a uuid), and
--  user_id defaults to the single-user partition key JOHN_USER_ID.
--  RLS is still enabled as defense-in-depth.
--
--  IDEMPOTENT: safe to run repeatedly.
-- ============================================================

-- ---------- A) Party click-in card columns on seminar_actors ----------
-- The 5-panel card. trajectory/action_upside/inaction_upside/faction_submap
-- are jsonb; current_position_decoded is prose. last_generated_at drives the
-- 7-day cache (regenerate only if older than 7 days or null).
alter table public.seminar_actors add column if not exists trajectory               jsonb;
alter table public.seminar_actors add column if not exists current_position_decoded text;
alter table public.seminar_actors add column if not exists action_upside            jsonb;
alter table public.seminar_actors add column if not exists inaction_upside          jsonb;
alter table public.seminar_actors add column if not exists faction_submap           jsonb;
alter table public.seminar_actors add column if not exists last_generated_at         timestamptz;

-- ---------- B) Debate Room: cached persona openings on the deep dive ----------
-- One Claude call per edition produces the 4 personas' opening reads; cache
-- them on the deep_dive row so every reader doesn't re-pay for them.
alter table public.seminar_deep_dive add column if not exists debate_openings    jsonb;
alter table public.seminar_deep_dive add column if not exists debate_openings_at  timestamptz;

-- ---------- C) seminar_debates: per-user debate threads ----------
-- One row per (persona) debate thread for an edition. `messages` is the full
-- jsonb array of {role:'user'|'assistant', content}. Appended in place.
create table if not exists public.seminar_debates (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null default '11111111-1111-1111-1111-111111111111',
  seminar_id  bigint not null references public.seminar_editions (id) on delete cascade,
  persona     text   not null,
  messages    jsonb  not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists seminar_debates_user_edition_idx
  on public.seminar_debates (user_id, seminar_id, created_at desc);
create index if not exists seminar_debates_seminar_idx
  on public.seminar_debates (seminar_id);

-- RLS: defense-in-depth (API connects as postgres, bypasses). No auth.uid()
-- policy because there is no Supabase Auth in this app.
alter table public.seminar_debates enable row level security;

-- updated_at touch trigger (reuses the Phase-1 shared function).
do $$ begin
  create trigger seminar_debates_touch before update on public.seminar_debates
    for each row execute function public.seminar_touch_updated_at();
exception when duplicate_object then null; end $$;
