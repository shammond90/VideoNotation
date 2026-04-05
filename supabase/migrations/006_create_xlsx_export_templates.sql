-- XLSX export templates: user-saved global export layout presets
create table if not exists public.xlsx_export_templates (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  columns jsonb not null default '[]'::jsonb,        -- ExportTemplateColumn[]
  color_overrides jsonb not null default '{}'::jsonb, -- Record<string, string>
  include_skipped boolean not null default false,
  excluded_cue_types jsonb not null default '[]'::jsonb, -- string[]
  created_at text not null,          -- ISO 8601
  updated_at text not null           -- ISO 8601
);

-- Indexes
create index if not exists idx_xlsx_export_templates_user_id on public.xlsx_export_templates(user_id);

-- RLS
alter table public.xlsx_export_templates enable row level security;

create policy "Users can read own xlsx_export_templates"
  on public.xlsx_export_templates for select
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can insert own xlsx_export_templates"
  on public.xlsx_export_templates for insert
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can update own xlsx_export_templates"
  on public.xlsx_export_templates for update
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Users can delete own xlsx_export_templates"
  on public.xlsx_export_templates for delete
  using ((select auth.jwt() ->> 'sub') = user_id);
