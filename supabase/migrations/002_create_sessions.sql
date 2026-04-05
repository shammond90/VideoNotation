-- Active sessions table: enforces single-device policy
create table if not exists public.active_sessions (
  user_id text primary key references public.users(id) on delete cascade,
  session_id text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- RLS
alter table public.active_sessions enable row level security;

create policy "Users can read own session"
  on public.active_sessions for select
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can insert own session"
  on public.active_sessions for insert
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can update own session"
  on public.active_sessions for update
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can delete own session"
  on public.active_sessions for delete
  using ((select auth.jwt() ->> 'sub') = user_id);
