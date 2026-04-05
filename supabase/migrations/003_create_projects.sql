-- Projects table: mirrors IndexedDB project records
create table if not exists public.projects (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  production_name text,
  choreographer text,
  venue text,
  year text,
  notes text,
  config jsonb not null default '{}'::jsonb,
  video_meta jsonb,                  -- { name, size, duration } or null
  columns jsonb not null default '[]'::jsonb,
  export_templates jsonb not null default '[]'::jsonb,
  config_template_id text,
  created_at bigint not null,        -- millisecond timestamp (matches IndexedDB)
  updated_at bigint not null
);

-- Indexes
create index if not exists idx_projects_user_id on public.projects(user_id);

-- RLS
alter table public.projects enable row level security;

create policy "Users can read own projects"
  on public.projects for select
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using ((select auth.jwt() ->> 'sub') = user_id);
