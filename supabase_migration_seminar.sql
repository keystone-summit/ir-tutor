-- ============================================================
--  IR Tutor — Foreign Policy "Implications Seminar" (Phase 1)
--  Run AFTER the Supabase project is ACTIVE_HEALTHY.
--
--  Architecture note (same posture as the notes/chat_saves tables):
--  this app dropped the FK to auth.users during the PIN migration and
--  connects as the `postgres` role via the transaction pooler, which
--  BYPASSES Row-Level Security. The PIN bearer token (and the cron
--  secret for the ingestion/generation jobs) is the access control.
--  We keep RLS enabled as defense-in-depth, but the API reads/writes
--  as postgres so it isn't gated by RLS policies.
--
--  Everything lives in the public schema so it survives a Supabase
--  re-pause exactly like the rest of IR Tutor's data.
--
--  IDEMPOTENT: safe to run repeatedly. Uses `create table if not
--  exists`, `do $$ ... $$` guards for enums, and `create index if not
--  exists`.
-- ============================================================

-- ---------- enums (guarded so re-runs don't error) ----------
do $$ begin
  create type public.seminar_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.seminar_actor_type as enum
    ('state','individual','org','ngo','mnc','armed_group','institution');
exception when duplicate_object then null; end $$;

-- ---------- 1) seminar_news_raw -----------------------------
-- Raw ingested items from the multi-source feed. Deduped by url.
-- ai_summary is nullable: Phase 1 summarises selected events at
-- generation time rather than every raw item (cost discipline).
create table if not exists public.seminar_news_raw (
  id                  bigint generated always as identity primary key,
  source              text        not null,        -- e.g. 'BBC World'
  url                 text        not null unique,  -- dedup key
  title               text        not null,
  body_html           text,                         -- summary/description snippet
  region_tag          text,                         -- 'US' | 'PRC' | 'IRI' | ...
  worldview_tag       text,                         -- press worldview of the source
  ai_summary          text,                         -- nullable; filled on selection
  published_at        timestamptz,
  fetched_at          timestamptz not null default now(),
  used_in_seminar_id  bigint                        -- nullable FK, set on generation
);

-- ---------- 2) seminar_editions ----------------------------
create table if not exists public.seminar_editions (
  id              bigint generated always as identity primary key,
  week_start_date date        not null,
  week_end_date   date        not null,
  title           text,
  status          public.seminar_status not null default 'draft',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- one edition per week_start_date (re-running generation upserts)
create unique index if not exists seminar_editions_week_uidx
  on public.seminar_editions (week_start_date);

-- now that editions exists, wire the raw->edition FK (idempotent)
do $$ begin
  alter table public.seminar_news_raw
    add constraint seminar_news_raw_edition_fk
    foreign key (used_in_seminar_id)
    references public.seminar_editions (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- 3) seminar_events ------------------------------
-- The top-5 events of an edition. rank 1 = most consequential.
create table if not exists public.seminar_events (
  id               bigint generated always as identity primary key,
  seminar_id       bigint not null references public.seminar_editions (id) on delete cascade,
  rank             int    not null,
  title            text   not null,
  summary          text,                    -- 2-3 sentence AI summary
  reasoning        text,                    -- one-sentence "why it matters"
  source_url       text,
  source_name      text,
  source_region    text,
  raw_html         text,
  ai_lens_analysis jsonb,                    -- reserved (per-event lenses, Phase 2)
  created_at       timestamptz not null default now()
);

-- ---------- 4) seminar_deep_dive ---------------------------
-- The single deep-dive on the #1 event of an edition.
create table if not exists public.seminar_deep_dive (
  id            bigint generated always as identity primary key,
  seminar_id    bigint not null references public.seminar_editions (id) on delete cascade,
  event_id      bigint references public.seminar_events (id) on delete set null,
  layers        jsonb,                       -- {world, regional, bilateral, domestic, actor}
  lenses        jsonb,                       -- {realism, liberalism, constructivism, marxist, game_theory}
  gaps          jsonb,                       -- {info, source_bias, counterfactual, osint, counter_intel}
  implications  jsonb,                       -- {us_strategy, us_business, us_households}
  what_to_watch text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists seminar_deep_dive_edition_uidx
  on public.seminar_deep_dive (seminar_id);

-- ---------- 5) seminar_actors ------------------------------
-- Party / actor reference catalogue. faction_parent_id is a self FK
-- so factions can nest under a parent actor (Phase 2 click-in cards).
create table if not exists public.seminar_actors (
  id                    bigint generated always as identity primary key,
  name                  text not null,
  type                  public.seminar_actor_type not null,
  region                text,
  faction_parent_id     bigint references public.seminar_actors (id) on delete set null,
  historical_trajectory jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists seminar_actors_name_uidx
  on public.seminar_actors (lower(name));

-- ---------- indexes on every FK ----------------------------
create index if not exists seminar_events_seminar_idx     on public.seminar_events (seminar_id, rank);
create index if not exists seminar_deep_dive_seminar_idx  on public.seminar_deep_dive (seminar_id);
create index if not exists seminar_deep_dive_event_idx    on public.seminar_deep_dive (event_id);
create index if not exists seminar_actors_parent_idx      on public.seminar_actors (faction_parent_id);
create index if not exists seminar_news_raw_edition_idx   on public.seminar_news_raw (used_in_seminar_id);
create index if not exists seminar_news_raw_fetched_idx   on public.seminar_news_raw (fetched_at desc);
create index if not exists seminar_editions_status_idx    on public.seminar_editions (status, week_start_date desc);

-- ---------- RLS: defense-in-depth (API connects as postgres, bypasses) ----------
alter table public.seminar_news_raw  enable row level security;
alter table public.seminar_editions  enable row level security;
alter table public.seminar_events    enable row level security;
alter table public.seminar_deep_dive enable row level security;
alter table public.seminar_actors    enable row level security;

-- updated_at touch trigger (shared) ------------------------
create or replace function public.seminar_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger seminar_editions_touch  before update on public.seminar_editions
    for each row execute function public.seminar_touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger seminar_deep_dive_touch before update on public.seminar_deep_dive
    for each row execute function public.seminar_touch_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger seminar_actors_touch    before update on public.seminar_actors
    for each row execute function public.seminar_touch_updated_at();
exception when duplicate_object then null; end $$;
