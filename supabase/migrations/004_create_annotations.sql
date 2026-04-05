-- Annotations table: mirrors IndexedDB annotation records
create table if not exists public.annotations (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  video_key text not null,           -- "fileName:fileSize" composite key
  "timestamp" real not null,         -- seconds
  cue jsonb not null,                -- CueFields object
  status text not null default 'provisional',
  flagged boolean not null default false,
  flag_note text not null default '',
  sort_order real not null default 0,
  time_in_title real,
  link_cue_id text,
  created_at text not null,          -- ISO 8601 (matches IndexedDB Annotation.createdAt)
  updated_at text not null           -- ISO 8601 (matches IndexedDB Annotation.updatedAt)
);

-- Indexes
create index if not exists idx_annotations_project on public.annotations(project_id);
create index if not exists idx_annotations_project_video on public.annotations(project_id, video_key);

-- RLS
alter table public.annotations enable row level security;

create policy "Users can read own annotations"
  on public.annotations for select
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can insert own annotations"
  on public.annotations for insert
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can update own annotations"
  on public.annotations for update
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can delete own annotations"
  on public.annotations for delete
  using ((select auth.jwt() ->> 'sub') = user_id);
