-- Users table: synced from Clerk via client-side upsert
create table if not exists public.users (
  id text primary key,             -- Clerk user_id
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.users enable row level security;

create policy "Users can read own record"
  on public.users for select
  using ((select auth.jwt() ->> 'sub') = id);

create policy "Users can insert own record"
  on public.users for insert
  with check ((select auth.jwt() ->> 'sub') = id);

create policy "Users can update own record"
  on public.users for update
  using ((select auth.jwt() ->> 'sub') = id);
