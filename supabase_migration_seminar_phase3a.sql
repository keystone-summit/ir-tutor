-- ============================================================
--  IR Tutor — FP "Implications Seminar" PHASE 3a
--  Live Actor Graph: cross-edition relationship edges between
--  named entities (states, leaders, orgs, firms, armed groups).
--
--  Run AFTER supabase_migration_seminar.sql (Phase 1) and
--  supabase_migration_seminar_phase2.sql (Phase 2).
--  Apply with the SESSION pooler (DDL):
--    set SUPA_DB_PASSWORD=...   (see keystone_credentials_MASTER.txt)
--    node scripts/run_sql.js supabase_migration_seminar_phase3a.sql
--
--  IMPORTANT — this app dropped Supabase Auth during the PIN migration.
--  There is NO auth.users table and the API connects as the `postgres`
--  role via the pooler (RLS bypassed; the PIN bearer is the access
--  control). So — unlike the dispatch's reference DDL —
--  first_seen_seminar_id is BIGINT (matching seminar_editions.id, which
--  is a bigint identity, NOT a uuid). RLS is enabled as defense-in-depth.
--
--  Facet columns: the dispatch asks to "extend seminar_actors if missing
--  entity_type / region." Both already exist on seminar_actors:
--    - `type`   (enum seminar_actor_type: state|individual|org|ngo|mnc|
--                armed_group|institution) — surfaced as entity_type in the API
--    - `region` (text)
--  So no new actor columns are needed; the graph reads `type` + `region`.
--
--  IDEMPOTENT: safe to run repeatedly.
-- ============================================================

-- ---------- seminar_actor_relations: directed edge between two actors ----------
create table if not exists public.seminar_actor_relations (
  id                    bigint generated always as identity primary key,
  from_actor_id         bigint not null references public.seminar_actors (id) on delete cascade,
  to_actor_id           bigint not null references public.seminar_actors (id) on delete cascade,
  relation_type         text   not null,
  -- canonical values: 'allies' | 'opposes' | 'finances' | 'funded_by' | 'owns'
  -- | 'aligned_with' | 'employs' | 'family' | 'professional' | 'related_to'
  evidence              text,
  source_url            text,
  weight                int    default 1,
  first_seen_seminar_id bigint references public.seminar_editions (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists actor_relations_from_idx on public.seminar_actor_relations (from_actor_id);
create index if not exists actor_relations_to_idx   on public.seminar_actor_relations (to_actor_id);
create unique index if not exists actor_relations_unique_idx
  on public.seminar_actor_relations (from_actor_id, to_actor_id, relation_type);

alter table public.seminar_actor_relations enable row level security;

-- updated_at touch trigger (reuses the Phase-1 shared function).
do $$ begin
  create trigger seminar_actor_relations_touch before update on public.seminar_actor_relations
    for each row execute function public.seminar_touch_updated_at();
exception when duplicate_object then null; end $$;
