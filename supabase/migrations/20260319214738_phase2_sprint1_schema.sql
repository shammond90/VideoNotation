-- ============================================================================
-- Cuetation Phase 2 Sprint 1 — Full Schema Migration
-- ============================================================================
-- This migration brings the database from its current state (users table only)
-- to the full Phase 2 schema with all tables, functions, and RLS policies.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Helper functions
-- ──────────────────────────────────────────────────────────────────────────────

-- requesting_user_id() — reads the Clerk user ID from the JWT `sub` claim.
-- Required because auth.uid() does not work with Clerk third-party auth.
create or replace function requesting_user_id()
returns text as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )::text;
$$ language sql stable;

-- get_user_tier() — used by RLS policies to enforce feature limits.
create or replace function get_user_tier()
returns text as $$
  select tier from public.users
  where id = requesting_user_id();
$$ language sql stable security definer;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Alter existing users table to match spec
-- ──────────────────────────────────────────────────────────────────────────────

-- Make name nullable (spec says it should be)
alter table public.users alter column name drop not null;
alter table public.users alter column name drop default;

-- Add missing Stripe columns from the spec
alter table public.users add column if not exists stripe_subscription_id text;
alter table public.users add column if not exists current_period_end timestamptz;
alter table public.users add column if not exists lapsed_at timestamptz;

-- Make stripe_customer_id unique if it isn't already
-- (It already exists as a column, just ensure the constraint)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_stripe_customer_id_key'
  ) then
    alter table public.users add constraint users_stripe_customer_id_key unique (stripe_customer_id);
  end if;
end $$;

-- Add email uniqueness if not present
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_email_key'
  ) then
    alter table public.users add constraint users_email_key unique (email);
  end if;
end $$;

-- Drop existing RLS policies so we can recreate them cleanly
drop policy if exists "users_insert_own" on public.users;
drop policy if exists "users_read_own" on public.users;
drop policy if exists "users_update_own" on public.users;

-- Recreate users RLS policies using requesting_user_id()
create policy "Users can view own record"
on public.users for select to authenticated
using (id = requesting_user_id());

create policy "Users can update own record"
on public.users for update to authenticated
using (id = requesting_user_id());

-- Insert policy: allow useEnsureUser to create the user's own row
create policy "Users can insert own record"
on public.users for insert to authenticated
with check (id = requesting_user_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Projects table
-- ──────────────────────────────────────────────────────────────────────────────

create table public.projects (
  id              text primary key default gen_random_uuid()::text,
  user_id         text not null references public.users(id) on delete cascade,
  name            text not null,
  production_name text,
  venue           text,
  year            text,
  video_filename  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.projects enable row level security;

create policy "Users can view own projects"
on public.projects for select to authenticated
using (user_id = requesting_user_id());

create policy "Users can update own projects"
on public.projects for update to authenticated
using (user_id = requesting_user_id());

create policy "Users can delete own projects"
on public.projects for delete to authenticated
using (user_id = requesting_user_id());

-- Helper function for project count enforcement
create or replace function get_project_count()
returns integer as $$
  select count(*)::integer from public.projects
  where user_id = requesting_user_id();
$$ language sql stable;

-- Enforce project limit on insert based on tier
create policy "Enforce project limit on insert"
on public.projects for insert to authenticated
with check (
  user_id = requesting_user_id()
  and (
    case get_user_tier()
      when 'beginner' then get_project_count() < 2
      when 'advanced' then get_project_count() < 10
      when 'expert'   then get_project_count() < 50
      else false
    end
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Cue types table
-- ──────────────────────────────────────────────────────────────────────────────

create table public.cue_types (
  id          text primary key default gen_random_uuid()::text,
  project_id  text not null references public.projects(id) on delete cascade,
  name        text not null,
  short_code  text,
  colour      text not null default '#888888',
  is_reserved boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

alter table public.cue_types enable row level security;

create policy "Users can manage own cue types"
on public.cue_types for all to authenticated
using (
  project_id in (
    select id from public.projects where user_id = requesting_user_id()
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Fields table
-- ──────────────────────────────────────────────────────────────────────────────

create table public.fields (
  id          text primary key default gen_random_uuid()::text,
  project_id  text not null references public.projects(id) on delete cascade,
  label       text not null,
  input_type  text not null default 'text',
  size_hint   text not null default 'medium',
  is_reserved boolean not null default false,
  is_archived boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

alter table public.fields enable row level security;

create policy "Users can manage own fields"
on public.fields for all to authenticated
using (
  project_id in (
    select id from public.projects where user_id = requesting_user_id()
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Cues table
-- ──────────────────────────────────────────────────────────────────────────────

create table public.cues (
  id                  text primary key,
  project_id          text not null references public.projects(id) on delete cascade,
  cue_type_id         text references public.cue_types(id) on delete set null,
  cue_number          text,
  timecode            text,
  timecode_updated_at timestamptz,
  status              text not null default 'standby',
  is_cut              boolean not null default false,
  sort_order          integer,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table public.cues enable row level security;

create policy "Users can view own cues"
on public.cues for select to authenticated
using (
  project_id in (
    select id from public.projects where user_id = requesting_user_id()
  )
);

create policy "Users can update own cues"
on public.cues for update to authenticated
using (
  project_id in (
    select id from public.projects where user_id = requesting_user_id()
  )
);

create policy "Users can delete own cues"
on public.cues for delete to authenticated
using (
  project_id in (
    select id from public.projects where user_id = requesting_user_id()
  )
);

-- Helper function for cue count enforcement
create or replace function get_cue_count(p_project_id text)
returns integer as $$
  select count(*)::integer from public.cues
  where project_id = p_project_id;
$$ language sql stable;

-- Enforce cue limit on insert
create policy "Enforce cue limit on insert"
on public.cues for insert to authenticated
with check (
  project_id in (
    select id from public.projects where user_id = requesting_user_id()
  )
  and (
    case get_user_tier()
      when 'beginner' then get_cue_count(project_id) < 200
      else true
    end
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Cue field values table
-- ──────────────────────────────────────────────────────────────────────────────

create table public.cue_field_values (
  id         text primary key default gen_random_uuid()::text,
  cue_id     text not null references public.cues(id) on delete cascade,
  field_id   text not null references public.fields(id) on delete cascade,
  value      text,
  updated_at timestamptz default now(),
  unique(cue_id, field_id)
);

alter table public.cue_field_values enable row level security;

create policy "Users can manage own cue field values"
on public.cue_field_values for all to authenticated
using (
  cue_id in (
    select c.id from public.cues c
    join public.projects p on c.project_id = p.id
    where p.user_id = requesting_user_id()
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Templates table
-- ──────────────────────────────────────────────────────────────────────────────

create table public.templates (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references public.users(id) on delete cascade,
  name        text not null,
  config_json jsonb not null default '{}',
  is_default  boolean not null default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.templates enable row level security;

create policy "Users can manage own templates"
on public.templates for all to authenticated
using (user_id = requesting_user_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. Drop leftover tutorial table
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists "User can view their own tasks" on public.tasks;
drop policy if exists "Users must insert their own tasks" on public.tasks;
drop table if exists public.tasks;

-- ──────────────────────────────────────────────────────────────────────────────
-- Done. Schema matches Phase 2 Sprint 1 specification.
-- ──────────────────────────────────────────────────────────────────────────────
