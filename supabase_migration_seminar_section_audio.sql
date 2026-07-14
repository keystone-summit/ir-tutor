-- Whole-page, per-section seminar narration cache.
--
-- Extends the per-edition Weekly Briefing voice (seminar_briefing_audio) to every
-- readable section of the Foreign Policy reader. One row per (edition, section);
-- content_hash lets the serve endpoint regenerate a section only when its text
-- changes. The table is also created lazily by lib/seminarSectionVoice
-- (ensureSectionAudioTable) on first use, so applying this file is optional but
-- keeps the schema documented alongside the others.

create table if not exists public.seminar_section_audio (
  seminar_id   integer not null references public.seminar_editions(id) on delete cascade,
  section_key  text    not null,
  content_hash text    not null,
  mp3          bytea   not null,
  char_count   integer,
  byte_size    integer,
  voice_id     text,
  model_id     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (seminar_id, section_key)
);
