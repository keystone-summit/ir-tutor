-- ============================================================
--  IR Tutor — seminar_events.curated
--
--  The weekly pipeline (/api/seminar/generate) rebuilds an edition's
--  briefing by DELETING every seminar_events row for that edition and
--  re-inserting the five the selector picked. That is correct for the
--  auto-selected top five, but it also silently destroys any event added
--  by hand to the same edition (a curated story, a manual backfill, a
--  correction) the next time the Monday/Thursday chain — or the daily
--  heartbeat self-heal — re-runs for that week.
--
--  `curated` marks a row as hand-added. generate/route.js scopes its
--  delete to `coalesce(curated,false) = false`, so curated rows survive a
--  regeneration while the auto five are still replaced cleanly. Curated
--  rows are ranked after the auto five, so re-ranking 1..5 never collides.
--
--  IDEMPOTENT: safe to run repeatedly.
-- ============================================================

alter table public.seminar_events
  add column if not exists curated boolean not null default false;

comment on column public.seminar_events.curated is
  'Hand-added event. Preserved by /api/seminar/generate when it rebuilds the auto-selected top five.';

create index if not exists seminar_events_curated_idx
  on public.seminar_events (seminar_id, curated);

-- PostgREST is not used for this table (the app connects via pg as
-- postgres), but reload the schema cache anyway so nothing downstream
-- caches a stale column list.
notify pgrst, 'reload schema';
