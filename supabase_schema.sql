-- ============================================================
--  IR Tutor — database schema
--  Run this in Supabase:  SQL Editor  ->  New query  ->  paste  ->  Run
-- ============================================================

-- 1) Progress: which weeks each student has completed
create table if not exists public.progress (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  week_number int         not null,
  completed   boolean     not null default true,
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_number)
);

-- 2) Chat: every tutor conversation, per student, per week
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  week_number int         not null,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_user_week_idx
  on public.chat_messages (user_id, week_number, created_at);

-- 3) Row-Level Security: each student can only ever see/edit their OWN rows
alter table public.progress      enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own messages" on public.chat_messages;
create policy "own messages" on public.chat_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
