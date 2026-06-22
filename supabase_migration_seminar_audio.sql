-- Seminar Weekly Briefing voice narration store.
--
-- One combined MP3 per edition (the headline + top-five events, voiced by
-- ElevenLabs "Adam"). Stored in the DB rather than as a static file because the
-- weekly Vercel cron that generates it runs on a read-only filesystem and can't
-- write into public/ at run time. Streamed to the reader by
-- /api/seminar/briefing-audio?id=<n>; written by /api/seminar/voice-briefing.
--
-- This file documents the schema; the voice-briefing route also creates the
-- table lazily (CREATE TABLE IF NOT EXISTS) so no manual apply step is required.

create table if not exists public.seminar_briefing_audio (
  seminar_id integer primary key references public.seminar_editions(id) on delete cascade,
  mp3        bytea   not null,
  char_count integer,
  byte_size  integer,
  voice_id   text,
  model_id   text,
  created_at timestamptz not null default now()
);
