-- Add last_synced_at column to projects table for conflict resolution
ALTER TABLE public.projects ADD COLUMN last_synced_at bigint;
