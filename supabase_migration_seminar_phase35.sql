-- ============================================================
--  IR Tutor — FP "Implications Seminar" PHASE 3.5
--  Two bundled deliverables:
--    (1) Regional broadening — per-event region bucket + per-edition
--        region-coverage quota tracking (5-region weekly quota).
--    (2) Theory Library — a ~73-entry inline-clickable IR theory library
--        (seminar_theory_library) powering theory-tags + a standalone page.
--
--  Run AFTER:
--    supabase_migration_seminar.sql          (Phase 1)
--    supabase_migration_seminar_phase2.sql   (Phase 2)
--    supabase_migration_seminar_phase3a.sql  (Phase 3a)
--    supabase_migration_seminar_phase3b.sql  (Phase 3b)
--
--  Apply with the SESSION pooler (DDL):
--    set SUPA_DB_PASSWORD=...   (see keystone_credentials_MASTER.txt)
--    node scripts/run_sql.js supabase_migration_seminar_phase35.sql
--
--  IMPORTANT — like every other seminar table, this app dropped Supabase
--  Auth during the PIN migration; the API connects as the `postgres` role
--  via the pooler (RLS bypassed; the PIN bearer is the access control).
--  All ids are BIGINT identities, NOT uuids. The dispatch's reference DDL
--  named `id` + `related_theory_ids[]`; because slugs (not autogen bigint
--  ids) are the stable cross-link key for an idempotent seed, we add a
--  `slug` natural key and store cross-links as `related_slugs text[]`.
--  RLS is enabled as defense-in-depth (no policies — role bypasses RLS).
--
--  IDEMPOTENT: safe to run repeatedly.
-- ============================================================

-- ---------- (1a) per-event region bucket ----------
-- Which of the 5 weekly quota buckets this event belongs to. One of:
--   'middle_east' | 'asia' | 'americas' | 'europe_russia' | 'brics_trade'
alter table public.seminar_events
  add column if not exists region_bucket text;

create index if not exists seminar_events_region_bucket_idx
  on public.seminar_events (region_bucket);

-- ---------- (1b) per-edition region coverage / quota audit ----------
-- region_coverage: { "<bucket>": <count>, ... } across the edition's 5 events.
-- underweighted_regions: buckets the week's news could NOT fill (warning, not
-- an error — surfaced to the reader rather than skewing all events to one region).
alter table public.seminar_editions
  add column if not exists region_coverage        jsonb;
alter table public.seminar_editions
  add column if not exists underweighted_regions  text[];

-- ---------- (2) seminar_theory_library ----------
create table if not exists public.seminar_theory_library (
  id                bigint generated always as identity primary key,
  slug              text not null,                 -- stable natural key (cross-link target)
  name              text not null,
  school            text not null,                 -- one of 8 color-coded schools
  sub_school        text,
  era               text,                          -- Classical | Mid-century | Modern | Contemporary
  classic_thinker   text,
  definition        text not null,
  canonical_example text,
  modern_echo       text,
  related_slugs     text[],                        -- cross-links (resolve by slug at read time)
  match_terms       text[],                        -- inline-scan aliases for theory-tag wrapping
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- slug is the idempotent upsert key.
create unique index if not exists theory_library_slug_uidx
  on public.seminar_theory_library (lower(slug));
create index if not exists theory_library_school_idx
  on public.seminar_theory_library (school);
create index if not exists theory_library_era_idx
  on public.seminar_theory_library (era);

alter table public.seminar_theory_library enable row level security;

-- updated_at touch trigger (reuses the Phase-1 shared function).
do $$ begin
  create trigger seminar_theory_library_touch before update on public.seminar_theory_library
    for each row execute function public.seminar_touch_updated_at();
exception when duplicate_object then null; end $$;
