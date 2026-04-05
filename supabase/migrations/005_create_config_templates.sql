-- Config templates: user-saved configuration presets (global, not per-project)
create table if not exists public.config_templates (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  data jsonb not null,               -- TemplateData object
  created_at text not null,          -- ISO 8601
  updated_at text not null           -- ISO 8601
);

-- Indexes
create index if not exists idx_config_templates_user_id on public.config_templates(user_id);

-- RLS
alter table public.config_templates enable row level security;

create policy "Users can read own config_templates"
  on public.config_templates for select
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can insert own config_templates"
  on public.config_templates for insert
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can update own config_templates"
  on public.config_templates for update
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can delete own config_templates"
  on public.config_templates for delete
  using ((select auth.jwt() ->> 'sub') = user_id);
