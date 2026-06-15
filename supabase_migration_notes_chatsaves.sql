-- ============================================================
--  IR Tutor — Notes + AI Chat Saves (Option 3)
--  Run AFTER the Supabase project is restored (ACTIVE_HEALTHY).
--
--  Architecture note: this app dropped the FK to auth.users during
--  the PIN migration and connects as the `postgres` role via the
--  transaction pooler, which BYPASSES Row-Level Security. The PIN
--  bearer token is the access control. So — exactly like the existing
--  progress / chat_messages / app_auth tables — we do NOT add a FK to
--  auth.users and we keep RLS enabled only as defense-in-depth.
--
--  All rows are keyed to the single fixed user id
--  ('11111111-1111-1111-1111-111111111111', see lib/db.js JOHN_USER_ID).
--
--  week_number stores the LOCAL week (0-14). `course` distinguishes the
--  three courses ('ir_tutor' | 'write1001' | 'roots'). Chat history in
--  chat_messages is keyed by an OFFSET week number (IR 0-14, Write
--  1001-1014, Roots 2001-2014); the generate-summary endpoint maps
--  course -> offset when reading chat_messages.
-- ============================================================

-- 1) Notes: typed + voice-transcribed study notes, per course, per week.
create table if not exists public.notes (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null,
  course      text        not null,            -- 'ir_tutor' | 'write1001' | 'roots'
  week_number int         not null,            -- local week (0-14)
  content     text        not null,            -- note body (typed + transcribed combined)
  audio_url   text,                            -- nullable; reserved for future audio storage
  transcript  text,                            -- nullable; raw transcript if kept separate
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_user_course_week_idx
  on public.notes (user_id, course, week_number, created_at desc);

-- 2) Chat saves: an AI study summary + full transcript snapshot of a tutor chat.
create table if not exists public.chat_saves (
  id              bigint      generated always as identity primary key,
  user_id         uuid        not null,
  course          text        not null,        -- 'ir_tutor' | 'write1001' | 'roots'
  week_number     int         not null,        -- local week (0-14)
  summary         text        not null,        -- AI-generated study summary (4-6 bullets)
  transcript_json jsonb       not null,         -- { messages: [{role, content}, ...] }
  title           text,                         -- user-editable label
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists chat_saves_user_course_week_idx
  on public.chat_saves (user_id, course, week_number, created_at desc);

-- 3) Defense in depth: deny anon/authenticated. The API connects as the
--    postgres role through the pooler, which bypasses RLS (same posture as
--    progress / chat_messages / app_auth).
alter table public.notes      enable row level security;
alter table public.chat_saves enable row level security;
